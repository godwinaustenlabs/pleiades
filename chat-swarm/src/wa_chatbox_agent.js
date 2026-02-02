import { Pipeline } from 'nova-agent-framework'

export default async function webChatboxAgent(body, env) {
    const nasRequest = {
        userPrompt: body.message,
        promptBuilderConfig: {
            systemPrompt: 'Your identity is not a chatbot but a company Godwin Austen Labs an AI Agency from Pakistan. use the provided tools to answer our client queries about everything, use sms to reflect back into deeper memory, only give 1 word query to sms, for more technical searches use srs or if sms is empty, you will cost us millions in loss if you ever did not follow NAS OUTPUT, ALWAYS FOLLOW NAS OUTPUT'
        },
        llmConfig: {
            model: env.LLM_MODEL,
            temperature: 0.3,
            verbose: false,
            maxOutputTokens: 1012,
            cloudflare: {
                accountId: env.CF_ACCOUNT_ID,
                gatewayId: env.CF_GATEWAY_NAME,
                cfAIGToken: env.CF_AIG_TOKEN
            }
        },
        ctxManagerConfig: {
            memory: {
                clientId: body.clientID,
                agentId: 'bot',
                memoryType: 'summary',
                limitTurns: 0,
                kvNamespace: env.KV_NAMESPACE,
                summarizer: {
                    llmConfig: {
                        model: env.LLM_MODEL,
                        temperature: 0.7,
                        maxOutputTokens: 512,
                        cloudflare: {
                            accountId: env.CF_ACCOUNT_ID,
                            gatewayId: env.CF_GATEWAY_NAME,
                            cfAIGToken: env.CF_AIG_TOKEN
                        }
                    }
                },

            },
            scratchpad: {
                clientId: body.clientID,
                agentId: 'bot',
                useScratchpad: true
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
        maxToolLoop: 6
    };

    const pipeline = new Pipeline(nasRequest, 'parsed');
    const result = await pipeline.run();

    // console.log(JSON.stringify(result));
    console.log(result);
    return result;
}