import webChatboxAgent from './web_chatbox_agent.js';
import ChatSessionDO from './chatSessionDO.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { html } from './web/index.js';

/**
 * Nova Framework Main Worker (index.js)
 * 
 * DESIGN PATTERN (NUMBERED FLOW):
 * 1. Incoming requests are filtered for CORS/Options.
 * 2. AUTHENTICATION: Requests to /web and /api are checked for a password.
 * 3. ROUTING: Requests are routed based on pathname (/whatsapp, /web, /api, /internal).
 * 4. WHATSAPP WEBHOOK: Logic for Meta handshake and incoming message handling.
 * 5. DURABLE OBJECT PROXY: Shared logic for persistence and real-time.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Token', // Added custom token header
};

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        console.log(`[Worker] ${request.method} ${url.pathname}`);

        // [FLOW 1] CORS Handshake
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // [FLOW 2] AUTHENTICATION CHECK
        // If the user tries to access the dashboard (/web) or its data (/api), we check the password.
        // We use an exact check for '/web' so it doesn't block '/website'.
        if (url.pathname === '/web' || url.pathname.startsWith('/api')) {
            const token = request.headers.get('X-Dashboard-Token') || url.searchParams.get('token');
            const password = env.DASHBOARD_PASSWORD || 'nova-admin-123';

            // Exception: Serve the base /web page even without token (it will prompt for password)
            if (url.pathname === '/web' && request.method === 'GET' && token !== password) {
                return new Response(html, {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'text/html' }
                });
            }

            // Reject API calls or WebSocket handshakes if the token is wrong
            if (token !== password) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }
        }

        // [FLOW 3] ROUTING LOGIC

        // --- WEB CHAT AGENT (Stateless): Direct call to agent ---
        if (url.pathname === '/website' && request.method === 'POST') {
            try {
                const body = await request.json();
                const result = await webChatboxAgent(body, env);
                return new Response(JSON.stringify(result), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            } catch (err) {
                console.error('Web Agent Error:', err);
                return new Response('Error Processing Request', { status: 500, headers: corsHeaders });
            }
        }

        // --- DASHBOARD API: List Clients ---
        if (url.pathname === '/api/clients') {
            const clientsRaw = await env.CLIENTS_KV_NAMESPACE.get('clients');
            return new Response(clientsRaw || '[]', { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // --- DASHBOARD API: Fetch Messages ---
        if (url.pathname === '/api/messages') {
            const clientID = url.searchParams.get('clientID');
            if (!clientID) return new Response('Missing clientID', { status: 400 });
            const id = env.CHAT_SESSION_DO.idFromName(clientID);
            const stub = env.CHAT_SESSION_DO.get(id);
            return await stub.fetch(`https://do/messages`);
        }

        // --- DASHBOARD API: Real-Time WebSocket ---
        if (url.pathname === '/api/ws') {
            const clientID = url.searchParams.get('clientID');
            const id = env.CHAT_SESSION_DO.idFromName(clientID);
            const stub = env.CHAT_SESSION_DO.get(id);

            // Proxy to DO, rewriting path to /ws for hibernatable connection
            const upgradeRequest = new Request('https://do-internal/ws', request);
            return await stub.fetch(upgradeRequest);
        }

        // --- DASHBOARD API: Manual Reply ---
        if (url.pathname === '/api/send') {
            const { contactID, message } = await request.json();
            await sendWhatsAppMessage(contactID, message, env);
            const id = env.CHAT_SESSION_DO.idFromName(contactID);
            const stub = env.CHAT_SESSION_DO.get(id);
            await stub.fetch(`https://do/manual_send`, {
                method: 'POST',
                body: JSON.stringify({ message })
            });
            return new Response('OK', { headers: corsHeaders });
        }

        // --- DASHBOARD API: Agent Status Control ---
        if (url.pathname === '/api/agent_status') {
            const clientID = url.searchParams.get('clientID');
            if (!clientID) return new Response('Missing clientID', { status: 400 });
            const id = env.CHAT_SESSION_DO.idFromName(clientID);
            const stub = env.CHAT_SESSION_DO.get(id);

            // Forward the request (GET or POST) to the DO
            return await stub.fetch(new Request(`https://do/agent_status`, request));
        }

        // [NEW] DASHBOARD API: Client Info (Naming) Proxy
        if (url.pathname === '/api/client_info') {
            const clientID = url.searchParams.get('clientID');
            if (!clientID) return new Response('Missing clientID', { status: 400 });
            const id = env.CHAT_SESSION_DO.idFromName(clientID);
            const stub = env.CHAT_SESSION_DO.get(id);
            return await stub.fetch(new Request(`https://do/client_info`, request));
        }

        // [NEW] DASHBOARD API: Hard Delete Proxy + KV Cleanup
        if (url.pathname === '/api/delete_client') {
            const clientID = url.searchParams.get('clientID');
            if (!clientID) return new Response('Missing clientID', { status: 400 });

            // 1. Tell the DO to wipe its SQLite and Storage
            const id = env.CHAT_SESSION_DO.idFromName(clientID);
            const stub = env.CHAT_SESSION_DO.get(id);
            await stub.fetch(`https://do/delete`);

            // 2. Remove from global clients list in KV so they disappear from Sidebar
            const clientsRaw = await env.CLIENTS_KV_NAMESPACE.get('clients');
            if (clientsRaw) {
                let clients = JSON.parse(clientsRaw);
                clients = clients.filter(c => c !== clientID);
                await env.CLIENTS_KV_NAMESPACE.put('clients', JSON.stringify(clients));
            }

            return new Response('OK', { headers: corsHeaders });
        }

        // [FLOW 4] WHATSAPP WEBHOOK
        if (url.pathname === '/whatsapp') {
            // Handshake (GET)
            if (request.method === 'GET') {
                const mode = url.searchParams.get('hub.mode');
                const token = url.searchParams.get('hub.verify_token');
                const challenge = url.searchParams.get('hub.challenge');
                if (mode === 'subscribe' && token === env.WA_VERIFY_TOKEN) {
                    return new Response(challenge, { status: 200 });
                }
                return new Response('Forbidden', { status: 403 });
            }

            // Incoming (POST)
            if (request.method === 'POST') {
                try {
                    const body = await request.json();
                    const entry = body.entry?.[0];
                    const change = entry?.changes?.[0];
                    const value = change?.value;
                    const msg = value?.messages?.[0];

                    if (msg?.text?.body) {
                        const clientID = msg.from;
                        const userName = value.contacts?.[0]?.profile?.name || msg.from;

                        await trackClient(clientID, env);
                        await processDO({
                            clientID,
                            contactID: clientID,
                            userName,
                            message: msg.text.body,
                            channel: 'whatsapp'
                        }, env, url);
                    }
                    return new Response('OK');
                } catch (e) { return new Response('Error', { status: 500 }); }
            }
        }

        // [FLOW 5] INTERNAL REPLIES
        if (url.pathname === '/internal') {
            const { contactID, message } = await request.json();
            await sendWhatsAppMessage(contactID, message, env);
            return new Response('OK');
        }

        return new Response('Not Found', { status: 404 });
    }
};

/**
 * Shared function to route a message to the appropriate Durable Object.
 */
async function processDO(payload, env, url) {
    const id = env.CHAT_SESSION_DO.idFromName(payload.clientID);
    const stub = env.CHAT_SESSION_DO.get(id);
    const response = await stub.fetch('https://do/process', {
        method: 'POST',
        body: JSON.stringify({ ...payload, replyWebhook: `${url.origin}/internal` }),
    });
    return await response.text();
}

/**
 * Utility to keep track of active clientIDs in KV storage for the Dashboard sidebar.
 */
async function trackClient(clientID, env) {
    try {
        const clientsRaw = await env.CLIENTS_KV_NAMESPACE.get('clients');
        let clients = [];
        if (clientsRaw) {
            try { clients = JSON.parse(clientsRaw); } catch (e) { }
        }
        if (!clients.includes(clientID)) {
            clients.push(clientID);
            await env.CLIENTS_KV_NAMESPACE.put('clients', JSON.stringify(clients));
        }
    } catch (err) { console.error('KV Error:', err); }
}

export { ChatSessionDO };
