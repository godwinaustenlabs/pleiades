import webChatboxAgent from './web_chatbox_agent.js';
import ChatSessionDO from './chatSessionDO.js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
// Export Durable Object classes so Wrangler knows about them
export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ================================
        // CORS
        // ================================
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        // ================================
        // Internal webhook to send WhatsApp messages
        // ================================
        if (url.pathname === '/internal') {
            const { to, message } = await request.json();
            await sendWhatsAppMessage(to, message, env);
            return new Response('OK');
        }

        // ================================
        // WHATSAPP WEBHOOK
        // ================================
        if (url.pathname === '/whatsapp') {

            // ---- Verification (Meta handshake)
            if (request.method === 'GET') {
                const mode = url.searchParams.get('hub.mode');
                const token = url.searchParams.get('hub.verify_token');
                const challenge = url.searchParams.get('hub.challenge');

                if (mode === 'subscribe' && token === env.WA_VERIFY_TOKEN) {
                    return new Response(challenge, { status: 200, headers: corsHeaders });
                }

                return new Response('Forbidden', { status: 403, headers: corsHeaders });
            }

            // ---- Incoming messages
            if (request.method === 'POST') {
                let body;
                try {
                    body = await request.json();
                } catch {
                    return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
                }

                try {
                    const entry = body.entry?.[0];
                    const change = entry?.changes?.[0];
                    const value = change?.value;
                    const message = value?.messages?.[0];

                    if (!message || message.type !== 'text' || !message.text?.body) {
                        return new Response('EMPTY MSG', { status: 200, headers: corsHeaders });
                    }

                    const from = message.from;
                    const text = message.text.body;
                    const number = value.metadata.display_phone_number;
                    console.log('Received message from', from, ':', text);

                    // Call WhatsApp agent
                    const clientID = from;

                    const id = env.CHAT_SESSION_DO.idFromName(clientID);
                    const stub = env.CHAT_SESSION_DO.get(id);

                    const request = {
                        clientID,
                        user: from,
                        message: text,
                        replyWebhook: `https://chat-swarm.saadnaik.workers.dev/internal`,
                    }

                    try {
                        await processDO(request, env);
                    } catch (err) {
                        console.error('Error processing DO:', err);
                    }

                    return new Response('OK', { status: 200, headers: corsHeaders });

                } catch (err) {
                    return new Response(
                        JSON.stringify({ error: err.message }),
                        { status: 500, headers: corsHeaders }
                    );
                }
            }

            return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
        }

        // ================================
        // Process DO
        // ================================
        async function processDO(request, env) {
            const body = await request;
            const clientID = body.clientID;
            const user = body.user;
            const message = body.message;
            const replyWebhook = body.replyWebhook;

            const id = env.CHAT_SESSION_DO.idFromName(clientID);
            const stub = env.CHAT_SESSION_DO.get(id);

            await stub.fetch('https://do/process', {
                method: 'POST',
                body: JSON.stringify({
                    clientID,
                    user,
                    message,
                    replyWebhook,
                }),
            });

            return new Response('DO OK', { status: 200, headers: corsHeaders });
        }


        // ================================
        // WEB CHATBOX
        // ================================
        if (url.pathname === '/web') {
            if (request.method !== 'POST') {
                return new Response('Method Not Allowed', {
                    status: 405,
                    headers: corsHeaders,
                });
            }

            let body;
            try {
                body = await request.json();
            } catch {
                return new Response(
                    JSON.stringify({ error: 'Invalid JSON body' }),
                    {
                        status: 400,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json',
                        },
                    }
                );
            }

            try {
                const result = await webChatboxAgent(body, env);

                return new Response(
                    JSON.stringify(result.content),
                    {
                        status: 200,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json',
                        },
                    }
                );
            } catch (err) {
                return new Response(
                    JSON.stringify({ error: err.message }),
                    {
                        status: 500,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/json',
                        },
                    }
                );
            }
        }

        // ================================
        // FALLBACK
        // ================================
        return new Response('Not Found', { status: 404, headers: corsHeaders });
    },
};

// ================================
// WhatsApp Sender
// ================================
async function sendWhatsAppMessage(to, message, env) {
    console.log('Sending WhatsApp message to', to, ':', message);
    await fetch(
        `https://graph.facebook.com/v22.0/${env.WA_PHONE_NUMBER_ID}/messages`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.WA_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                text: { body: message },
            }),
        }
    );
}

export { ChatSessionDO };
