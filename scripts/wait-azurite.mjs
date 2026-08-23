/*
 * Attende che Azurite sia pronto prima di avviare il Functions host.
 *
 * Perché serve: sotto `npm run dev` (concurrently) azurite e `func` partono
 * insieme. Se il host delle Functions raggiunge lo storage prima che Azurite
 * abbia messo in ascolto le sue porte, aborta con
 *   "Value cannot be null. (Parameter 'provider')".
 * Un ritardo fisso non basta: il primo avvio di Azurite (cartella .azurite
 * appena creata) può metterci più del previsto. Qui aspettiamo davvero che la
 * porta del servizio Table accetti connessioni, con un tetto di sicurezza.
 */
import net from "node:net";

const HOST = "127.0.0.1";
const PORT = 10002; // Azurite Table
const DEADLINE = Date.now() + 60000; // arrenditi dopo 60s e prova comunque

function attempt() {
  const socket = net.connect(PORT, HOST);
  socket.once("connect", () => {
    socket.end();
    process.exit(0);
  });
  socket.once("error", () => {
    socket.destroy();
    if (Date.now() > DEADLINE) process.exit(0); // non bloccare all'infinito
    setTimeout(attempt, 300);
  });
}

attempt();
