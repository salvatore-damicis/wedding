/*
 * ApiAdapter — real implementation of the storage interface. Talks to the
 * Azure Functions under `apiBase` (/api). The storage-account key never
 * reaches the browser: the Functions verify the PIN, own the metadata, and
 * hand back a short-lived SAS so the browser uploads the image bytes DIRECTLY
 * to Blob storage (bytes don't pass through the Function — see ADR-0003).
 *
 * Upload flow:
 *   1. POST /requestUpload  -> { id, uploadUrl (SAS), blobUrl }
 *   2. PUT the file to uploadUrl (direct to Blob)
 *   3. POST /confirmUpload   -> Photo (metadata now recorded)
 */
export class ApiAdapter {
  constructor(apiBase = "/api") {
    this.base = apiBase.replace(/\/$/, "");
  }

  async _json(path, opts = {}) {
    const res = await fetch(this.base + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = (await res.json()).error || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  listSpaces() {
    return this._json("/listSpaces");
  }

  getSpace(nickname) {
    return this._json(`/getSpace?nickname=${encodeURIComponent(nickname)}`);
  }

  createOrEnter(nickname, pin) {
    return this._json("/createOrEnter", {
      method: "POST",
      body: JSON.stringify({ nickname, pin }),
    }).catch((e) => ({ ok: false, reason: e.message }));
  }

  /* onProgress(frazione 0..1) è opzionale: alimenta la barra di avanzamento.
     Le foto/video salgono ORIGINALI (nessuna compressione, per scelta). */
  async uploadPhoto(nickname, pin, file, onProgress) {
    const type = file.type.startsWith("video/") ? "video" : "image";
    const { id, uploadUrl, blobUrl } = await this._json("/requestUpload", {
      method: "POST",
      body: JSON.stringify({ nickname, pin, fileName: file.name, contentType: file.type }),
    });

    await this._put(uploadUrl, file, onProgress);

    return this._json("/confirmUpload", {
      method: "POST",
      body: JSON.stringify({ nickname, pin, id, name: file.name, blobUrl, type, caption: "" }),
    });
  }

  /* PUT diretto al Blob via XHR (non fetch) per avere upload.onprogress. */
  _put(uploadUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
      if (file.type) xhr.setRequestHeader("Content-Type", file.type);
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
      }
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("Upload al blob fallito"));
      xhr.onerror = () => reject(new Error("Upload al blob fallito"));
      xhr.send(file);
    });
  }

  setCover(nickname, pin, id) {
    return this._json("/setCover", {
      method: "POST",
      body: JSON.stringify({ nickname, pin, id }),
    });
  }

  setCaption(nickname, pin, id, caption) {
    return this._json("/setCaption", {
      method: "POST",
      body: JSON.stringify({ nickname, pin, id, caption }),
    });
  }

  async deletePhoto(nickname, pin, id) {
    await this._json("/deletePhoto", {
      method: "POST",
      body: JSON.stringify({ nickname, pin, id }),
    });
  }

  async deleteSpace(adminPin, nickname) {
    await this._json("/deleteSpace", {
      method: "POST",
      body: JSON.stringify({ adminPin, nickname }),
    });
  }
}
