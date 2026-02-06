import waChatboxAgent from './wa_chatbox_agent.js';

export default class ChatSessionDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
    }

    async fetch(request) {
        const job = await request.json();

        // Process directly — DO already guarantees ordering per ID
        const result = await waChatboxAgent(
            {
                user: job.user,
                message: job.message,
                clientID: job.clientID,
            },
            this.env
        );

        await fetch(job.replyWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: job.user,
                message: result,
            }),
        });

        return new Response(JSON.stringify({ status: 'done' }), { status: 200 });
    }
}