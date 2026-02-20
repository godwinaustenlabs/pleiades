import waChatboxAgent from './wa_chatbox_agent.js';

/**
 * ChatSessionDO: Handles the persistent state and real-time communication for a single conversation.
 * 
 * FLOW OF EVENTS:
 * 1. Constructor initializes SQLite for permanent storage.
 * 2. fetch() routes incoming requests (Messages or WS handshakes).
 * 3. process() handles the AI logic and triggers a broadcast.
 * 4. broadcast() pushes data to all live dashboards instantly.
 */
export default class ChatSessionDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;

        // [FLOW 1] Initialize SQLite table to store conversation history permanently.
        this.state.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT,
                text TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // [NEW] Load agent status and friendly name from storage, default values
        this.state.blockConcurrencyWhile(async () => {
            this.agentEnabled = (await this.state.storage.get('agent_enabled')) !== false;
            this.friendlyName = (await this.state.storage.get('friendly_name')) || null;
        });
    }

    /**
     * Helper to push updates to all active WebSocket sessions for this client.
     * Uses Hibernatable WebSocket API (no need to track sessions in a manual Set).
     */
    broadcast(msg) {
        // [FLOW 4] Retrieve all currently connected WebSockets (even hibernating ones).
        const sockets = this.state.getWebSockets();
        const payload = JSON.stringify(msg);

        console.log(`[DO] Broadcasting type ${msg.type || 'message'} to ${sockets.length} sessions`);
        sockets.forEach(ws => {
            try {
                ws.send(payload);
            } catch (e) {
                console.error("Broadcast failed for a socket", e);
            }
        });
    }

    async fetch(request) {
        const url = new URL(request.url);

        // [FLOW 2] Handle Real-Time WebSocket Handshake
        if (url.pathname === '/ws') {
            const [client, server] = new WebSocketPair();

            // [FLOW 2.1] Accept the socket and hand it to the DO's hibernation manager.
            // This allows the DO to sleep while the connection stays open.
            this.state.acceptWebSocket(server);

            return new Response(null, { status: 101, webSocket: client });
        }

        // [NEW] Agent Status Endpoint
        if (url.pathname === '/agent_status') {
            if (request.method === 'POST') {
                const { enabled } = await request.json();
                this.agentEnabled = enabled;
                await this.state.storage.put('agent_enabled', enabled);
                // Broadcast the change to all dashboard tabs
                this.broadcast({ type: 'agent_status', enabled });
                return new Response('OK');
            }
            return new Response(JSON.stringify({ enabled: this.agentEnabled }), { headers: { 'Content-Type': 'application/json' } });
        }

        // [NEW] Client Info (Friendly Name) Endpoint
        if (url.pathname === '/client_info') {
            if (request.method === 'POST') {
                const { friendlyName } = await request.json();
                this.friendlyName = friendlyName;
                await this.state.storage.put('friendly_name', friendlyName);
                // Broadcast change so UI updates name instantly
                this.broadcast({ type: 'client_info', friendlyName });
                return new Response('OK');
            }
            return new Response(JSON.stringify({ friendlyName: this.friendlyName, clientID: this.state.id.toString() }), { headers: { 'Content-Type': 'application/json' } });
        }

        // [NEW] Hard Delete Endpoint
        if (url.pathname === '/delete') {
            console.log(`[DO] Hard deleting storage for ${this.state.id.toString()}`);
            await this.state.storage.deleteAll();
            // Optional: Broadcast deletion so UI clears automatically
            this.broadcast({ type: 'deleted' });
            return new Response('OK');
        }

        // [FLOW 3] Main Message Processor (Incoming from WhatsApp or Web)
        if (url.pathname === '/process') {
            const job = await request.json();

            // 1. Log incoming message (User -> Agent)
            if (job.channel === 'whatsapp') {
                this.state.storage.sql.exec(
                    `INSERT INTO messages (sender, text) VALUES (?, ?)`,
                    'user', job.message
                );
                // [FLOW 3.1] Trigger broadcast so dashboard shows the user's message immediately.
                this.broadcast({ sender: 'user', text: job.message, timestamp: new Date().toISOString() });
            }

            // 2. Run the agent logic ONLY if enabled
            let result = null;
            if (this.agentEnabled) {
                result = await waChatboxAgent(job, this.env);

                // 3. Log agent response (Agent -> User)
                if (job.channel === 'whatsapp') {
                    this.state.storage.sql.exec(
                        `INSERT INTO messages (sender, text) VALUES (?, ?)`,
                        'agent', result
                    );
                    // [FLOW 3.2] Trigger broadcast so dashboard shows the agent's reply immediately.
                    this.broadcast({ sender: 'agent', text: result, timestamp: new Date().toISOString() });
                }
            } else {
                console.log(`[DO] Agent is DISABLED for ${job.clientID}. Skipping AI response.`);
                // Notify dashboard that agent was skipped (optional UI indicator)
                this.broadcast({ type: 'notification', text: "Agent response skipped (Human Mode active)" });
            }

            // 4. Send reply back to WhatsApp if needed
            if (result && job.channel === 'whatsapp' && job.replyWebhook) {
                await fetch(job.replyWebhook, {
                    method: 'POST',
                    body: JSON.stringify({ contactID: job.contactID, message: result })
                });
            }

            return new Response(result);
        }

        // Dashboard Endpoint: Load history from SQLite
        if (url.pathname === '/messages') {
            const results = this.state.storage.sql.exec(`SELECT * FROM messages ORDER BY timestamp ASC`).toArray();
            return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
        }

        // Dashboard Endpoint: Log a manual reply sent by the admin
        if (url.pathname === '/manual_send') {
            const { message } = await request.json();
            this.state.storage.sql.exec(
                `INSERT INTO messages (sender, text) VALUES (?, ?)`,
                'agent_manual', message
            );
            // [FLOW 3.3] Broadcast the manual reply to all open dashboard tabs.
            this.broadcast({ sender: 'agent_manual', text: message, timestamp: new Date().toISOString() });
            return new Response('OK');
        }

        return new Response('Not Found', { status: 404 });
    }

    /**
     * Hibernatable WebSocket event handlers.
     * These allow the DO to respond to socket events even after being evicted from memory.
     */
    async webSocketMessage(ws, message) {
        console.log("[DO] Hibernatable WS received message:", message);
        // We don't expect messages FROM the dashboard yet, but this is where they'd go.
    }

    async webSocketClose(ws, code, reason, wasClean) {
        console.log("[DO] Hibernatable WS closed");
    }

    async webSocketError(ws, error) {
        console.error("[DO] Hibernatable WS error:", error);
    }
}