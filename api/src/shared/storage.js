/*
 * Shared storage helpers for all Functions: Azure Table (metadata) + Blob
 * (photos) + PIN hashing. Works against Azurite locally and real Azure in
 * production — only the connection string changes (see ADR-0003).
 *
 * Data model
 *   Table "spaces": partitionKey="space", rowKey=nickname, {pinSalt, pinHash, createdAt}
 *   Table "photos": partitionKey=nickname,  rowKey=id,      {name, url, uploadedAt}
 *   Blob container "photos": blob path `${enc(nickname)}/${id}`, public read.
 */
const crypto = require("crypto");
const { TableClient } = require("@azure/data-tables");
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

// Azurite's well-known dev account (used when connection = UseDevelopmentStorage=true)
const DEV_CONN =
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;" +
  "TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;" +
  "QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;";

function connStr() {
  const c =
    process.env.STORAGE_CONNECTION || process.env.AzureWebJobsStorage || "UseDevelopmentStorage=true";
  return c === "UseDevelopmentStorage=true" ? DEV_CONN : c;
}

const CONTAINER = process.env.BLOB_CONTAINER || "photos";
const ADMIN_PIN = process.env.ADMIN_PIN || "changeme-admin";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const isDev = connStr().includes("devstoreaccount1");

function parseAccount(c) {
  const map = {};
  for (const kv of c.split(";")) {
    const i = kv.indexOf("=");
    if (i > 0) map[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return { name: map.AccountName, key: map.AccountKey };
}

function tableClient(name) {
  return TableClient.fromConnectionString(connStr(), name, { allowInsecureConnection: isDev });
}
function blobService() {
  return BlobServiceClient.fromConnectionString(connStr(), { allowInsecureConnection: isDev });
}

function blobPath(nickname, id) {
  return `${encodeURIComponent(nickname)}/${id}`;
}

// ---- one-time setup (tables, container, CORS) ----
// Only a SUCCESSFUL run is cached; a failure clears the cache so the next
// request retries (e.g. after the storage backend becomes reachable).
let initDone;
async function ensureInit() {
  if (initDone) return initDone;
  const run = (async () => {
    await tableClient("spaces").createTable().catch(() => {});
    await tableClient("photos").createTable().catch(() => {});
    await tableClient("site").createTable().catch(() => {});
    // Gioco live (ADR-0005): giocatori e risposte del quiz condotto dagli Sposi.
    await tableClient("players").createTable().catch(() => {});
    await tableClient("answers").createTable().catch(() => {});
    const svc = blobService();
    await svc.getContainerClient(CONTAINER).createIfNotExists({ access: "blob" });
    // CORS so the browser can PUT directly to Blob with the SAS.
    await svc
      .setProperties({
        cors: [
          {
            allowedOrigins: ALLOWED_ORIGIN,
            allowedMethods: "GET,PUT,OPTIONS,HEAD",
            allowedHeaders: "*",
            exposedHeaders: "*",
            maxAgeInSeconds: 3600,
          },
        ],
      })
      .catch(() => {});
  })();
  initDone = run;
  try {
    await run;
  } catch (err) {
    initDone = undefined; // don't cache the failure
    throw err;
  }
  return run;
}

// ---- PIN hashing ----
function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(pin), salt, 32).toString("hex");
  return { salt, hash };
}
function verifyPin(entity, pin) {
  if (!entity) return false;
  const { hash } = hashPin(pin, entity.pinSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(entity.pinHash, "hex"));
}
function isAdmin(pin) {
  return String(pin) === ADMIN_PIN;
}

// ---- space lookup ----
async function getSpaceEntity(nickname) {
  try {
    return await tableClient("spaces").getEntity("space", nickname);
  } catch {
    return null;
  }
}

// ---- SAS for direct browser upload ----
function uploadSas(nickname, id) {
  const { name, key } = parseAccount(connStr());
  const cred = new StorageSharedKeyCredential(name, key);
  const path = blobPath(nickname, id);
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  // Finestra ampia: i video (nessun limite di peso, ADR "terminare il sito")
  // possono impiegare parecchio a salire su wifi debole.
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER,
      blobName: path,
      permissions: BlobSASPermissions.parse("cw"),
      startsOn,
      expiresOn,
    },
    cred
  ).toString();
  const blobUrl = blobService().getContainerClient(CONTAINER).getBlockBlobClient(path).url;
  return { uploadUrl: `${blobUrl}?${sas}`, blobUrl };
}

async function deleteBlob(nickname, id) {
  await blobService()
    .getContainerClient(CONTAINER)
    .getBlockBlobClient(blobPath(nickname, id))
    .deleteIfExists();
}

// ---- documenti di sito: mappa dei tavoli e impostazioni (ADR-0004) ----
// Tabella "site": partitionKey="site", rowKey="map" | "settings", { json, updatedAt }.
// Un documento unico per la mappa perché l'editor salva sempre tutto insieme:
// una sola scrittura = una sola transazione logica, niente mappe a metà.
const SITE_MAX_JSON = 60000; // margine sotto il limite di 64 KB per proprietà stringa

async function getSiteDoc(key) {
  try {
    const e = await tableClient("site").getEntity("site", key);
    return e.json ? JSON.parse(e.json) : null;
  } catch {
    return null; // non ancora salvato (o tabella appena creata)
  }
}

async function putSiteDoc(key, value) {
  const json = JSON.stringify(value);
  if (json.length > SITE_MAX_JSON) {
    const err = new Error("documento troppo grande");
    err.tooBig = true;
    throw err;
  }
  await tableClient("site").upsertEntity(
    { partitionKey: "site", rowKey: key, json, updatedAt: new Date().toISOString() },
    "Replace"
  );
}

// ---- HTTP helpers ----
function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    jsonBody: body,
  };
}

module.exports = {
  ensureInit,
  tableClient,
  hashPin,
  verifyPin,
  isAdmin,
  getSpaceEntity,
  uploadSas,
  deleteBlob,
  getSiteDoc,
  putSiteDoc,
  json,
  ADMIN_PIN,
};
