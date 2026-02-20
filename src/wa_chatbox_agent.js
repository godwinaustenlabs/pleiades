import { Pipeline } from 'nova-agent-framework'
import { z } from 'zod';
import { sendWhatsAppMessage } from './whatsapp.js';

export default async function waChatboxAgent(body, env) {
    const msgHuman = {
        name: "message_human",
        description: "Flag this conversation for human intervention if the request is too complex, sensitive, or requires manual review, or if specifically asked.",
        schema: z.object({
            reason: z.string().describe("The reason why human intervention is needed"),
            priority: z.enum(["low", "medium", "high"]).describe("Urgency of the intervention")
        }),
        func: async ({ reason, priority }) => {
            console.log(`[Escalation] ${priority.toUpperCase()}: ${reason}`);

            // Forward Request to Admin via WhatsApp
            if (env.admin) {
                try {
                    const adminMsg = `🚨 *Human Intervention Required*\n\n*Client:* ${body.clientID}\n*Priority:* ${priority.toUpperCase()}\n*Reason:* ${reason}\n\nPlease take over the conversation in the dashboard.`;
                    await sendWhatsAppMessage(env.admin, adminMsg, env);
                } catch (err) {
                    console.error('Failed to forward escalation to admin:', err);
                }
            }

            return JSON.stringify({ status: "success", message: "Human notified via WhatsApp and will take over shortly." });
        }
    };

    const nasRequest = {
        verbose: env.VERBOSE === 'true',

        // Tools Array
        tools: [msgHuman],

        // Context Manager Config (Memory)
        ctxManagerConfig: {
            clientId: body.clientID,
            agentId: "nova-wa-agent",
            memory: {
                memoryType: "buffer", // Use simple in-memory buffer for testing (no DB needed)
                limitTurns: 10,
                kvNamespace: env.MEMORY_KV_NAMESPACE,
            },
            srs: {
                env,
                pipelines: {
                    nova: {
                        binding: 'testing-rag',
                        description: 'Technical docs'
                    }
                },
                llmConfig: {
                    model: env.LLM_MODEL,
                    temperature: 0.7,
                    cloudflare: {
                        accountId: env.CF_ACCOUNT_ID,
                        gatewayId: env.CF_GATEWAY_NAME,
                        cfAIGToken: env.CF_AIG_TOKEN
                    },

                }
            }

        },

        // LLM Config (Provider: OpenAI or Groq)
        llmConfig: {
            model: env.LLM_MODEL,
            verbose: env.VERBOSE === 'true',
            api_keys: {
                openai: env.OPENAI_API_KEY,
                groq: env.GROQ_API_KEY,
                gemini: env.GEMINI_API_KEY
            },
            cloudflare: {
                accountId: env.CF_ACCOUNT_ID,
                gatewayId: env.CF_GATEWAY_NAME,
                cfAIGToken: env.CF_AIG_TOKEN
            },
        },

        // Prompt Builder Config
        promptBuilderConfig: {
            systemPrompt: "You are a helpful AI agent with access to several tools. \n\n- Use 'get_stock_quote' for real-time stock prices (e.g. AAPL, NVDA).\n- Use 'message_human' if the user's request is too complex, requires manual authority, or if you are stuck.\n- Use 'family-tree' for relations, 'get_weather' for weather, and 'search_flights'/'book_ticket' for travel. \n\nAlways use the appropriate tool for the user's request."
        }
    };

    const pipeline = new Pipeline(nasRequest, 'parsed');
    const result = await pipeline.run(body.message);

    // console.log(JSON.stringify(result));
    console.log(result);
    return result;
}