import { Pipeline } from 'nova-agent-framework'

export default async function webChatboxAgent(body, env) {
    const nasRequest = {
        verbose: env.VERBOSE === 'true',
        // Context Manager Config (Memory)
        ctxManagerConfig: {
            clientId: body.clientID,
            agentId: "nova-math-agent",
            memory: {
                memoryType: "buffer", // Use simple in-memory buffer for testing (no DB needed)
                limitTurns: 10,
                kvNamespace: env.KV_NAMESPACE,
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
            systemPrompt: "You are a helpful AI agent with access to several tools. Use 'family-tree' for relations, 'get_weather' for weather, and 'search_flights'/'book_ticket' for travel. Always use the appropriate tool for the user's request."
        },
    };

    const pipeline = new Pipeline(nasRequest);
    const result = await pipeline.run(body.message || body.userPrompt);

    // console.log(JSON.stringify(result));
    console.log("result:" + result);
    return result;
}