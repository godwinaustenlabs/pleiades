# Nova Agent Framework: The Definitive Guide

**Version**: 0.0.5  
**Package**: `nova-agent-framework`  
**Architecture**: Cloudflare Workers (Edge AI)  
**Repository**: `godwinaustenlabs/NovaSystems`  

---

# 📖 Table of Contents

1.  [**Part I: Philosophy & Introduction**](#part-i-philosophy)
    *   Why Nova? The Case for Edge Agents.
    *   Architecture Overview: The 4 Pillars.
2.  [**Part II: Getting Started**](#part-ii-getting-started)
    *   Prerequisites & Environment.
    *   Installation (`nova-agent-framework`).
    *   The `wrangler.jsonc` Configuration Bible.
3.  [**Part III: Core Concepts**](#part-iii-core-concepts)
    *   The Pipeline: Orchestrating Thought.
    *   The Brain: ChatLLM & Self-Healing.
    *   The Hands: ToolRegistry & Zod Validation.
    *   The Memory: ContextManager, KV, & RAG.
4.  [**Part IV: Building Agents**](#part-iv-building-agents)
    *   Step-by-Step Tutorial: "The Financial Analyst".
    *   Advanced Tool Patterns.
    *   System Prompts & Persona Engineering.
5.  [**Part V: API Reference**](#part-v-api-reference)
    *   `Pipeline`
    *   `ChatLLM`
    *   `ContextManager`
    *   `ToolRegistry`
    *   `Logger`
6.  [**Part VI: Deployment & Operations**](#part-vi-deployment)
    *   Cloudflare Setup.
    *   Secrets Management.
    *   Observability & Debugging.

---

<a name="part-i-philosophy"></a>
# Part I: Philosophy & Introduction

## Why Nova?

The era of massive, monolithic AI frameworks running on heavy Python servers (LangChain, AutoGen) is ending. The future is **Edge AI**, agents that run milliseconds away from users, scale instantly to zero, and incur minimal cold-start latency.

**Nova Agent Framework** (`nova-agent-framework`) is built specifically for this future. It is not a general-purpose library ported to JavaScript; it is an **Edge-Native** framework designed for **Cloudflare Workers**.

### Key Differentiators

1.  **Strict Typing**: Tools now use `zod` schemas to enforce strict JSON output from LLMs. If an LLM hallucinates a parameter, Nova catches it *before* execution.
2.  **Self-Healing**: Small models (Llama-70b, Haiku) often output broken JSON. Nova version 5's `ChatLLM` layer includes a regex-based surgical repair engine that fixes these errors on the fly, saving up to 30% of failed requests invisibly.
3.  **Aesthetic Observability**: Debugging async agent loops is hard. Nova includes a centralized `Logger` that visualizes the "Thinking Loop" (`🔄 LOOP 1 START` ... `TOOL EXECUTION` ... `🔄 LOOP 1 END`) directly in your terminal.
4.  **Unified Memory**: Short-term RAM buffers and long-term KV storage are abstracted into a single `ContextManager`.

---

<a name="part-ii-getting-started"></a>
# Part II: Getting Started

## Prerequisites

-   **Node.js**: v18.17.0 or later (Required for reliable `fetch` APIs).
-   **Wrangler (v3+)**: The Cloudflare CLI (`npm install -g wrangler`).
-   **Cloudflare Account**: A free account suffices for development.

## Installation

Install the core framework package into your Workers project.

```bash
# Initialize a new Cloudflare Worker project
npm create cloudflare@latest my-agent -- --type=hello-world

# Enter directory
cd my-agent

# Install Nova Framework
npm install nova-agent-framework zod
```

## The `wrangler.jsonc` Bible

The `wrangler.jsonc` file is the control center of your agent. It defines memory bindings, environment variables, and compute limits.

> **CRITICAL**: Nova relies on specific Environment Variable names (`LLM_MODEL`, `VERBOSE`).

### Complete Reference Configuration

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-nova-agent",
  "main": "src/index.js",
  "compatibility_date": "2026-01-31",
  
  // 1. Observability
  "observability": {
    "enabled": true
  },

  // 2. Global Variables
  "vars": {
    // LLM Selection
    "LLM_MODEL": "openai/gpt-4o",
    // "LLM_MODEL": "groq/llama-3.3-70b-versatile",
    
    // Logging Level (Set to 'false' in prod for speed)
    "VERBOSE": "true",

    // API Keys (It is safer to use `wrangler secret put` for these!)
    // "OPENAI_API_KEY": "sk-...",
    
    // Cloudflare AI Gateway (Optional but Recommended)
    "CF_ACCOUNT_ID": "your-account-id",
    "CF_GATEWAY_NAME": "nova-gateway",
    "CF_AIG_TOKEN": "token-xyz"
  },

  // 3. Memory Bindings (Cloudflare KV)
  "kv_namespaces": [
    {
      "binding": "KV_NAMESPACE", // Must match config passed to Pipeline
      "id": "your-kv-namespace-id"
    }
  ]
}
```

---

<a name="part-iii-core-concepts"></a>
# Part III: Core Concepts

## 1. The Pipeline (`src/core/pipeline.js`)

The `Pipeline` is the state machine that drives the agent. It enforces a strict "Thinking Loop":

1.  **Initialization**: Sets up the Logger, Memory, and Tool Registry.
2.  **Context Loading**: Fetches past conversation turns from KV/RAM.
3.  **System Prompt**: Injects the "Persona" and tool instructions.
4.  **The Loop (Max N Iterations)**:
    *   **Phase A (Think)**: Send history to LLM.
    *   **Phase B (Parse)**: Receive response. Is it text? Or a tool call?
    *   **Phase C (Act)**: If tool call -> Execute Tool -> Add Result to History -> **Repeat Loop**.
    *   **Phase D (Respond)**: If text -> Return Final Answer -> Save to Memory.
5.  **Persistence**: Saves the new session turns to long-term storage.

## 2. The Brain: `ChatLLM` & Self-Healing

Nova treats all LLM providers (OpenAI, Groq, Gemini) as interchangeable commodities. The `ChatLLM` class abstracts the differences.

**Self-Healing Logic**:
One of Nova's most powerful features. When an LLM outputs malformed JSON (e.g., missing quotes, trailing commas), the `ChatLLM` catches the `JSON.parse` error. It then applies a series of Regex heuristics to "repair" the JSON string and retries the tool execution automatically. This makes agents using headers models (like Llama-70b) significantly more reliable.

## 3. The Hands: `ToolRegistry`

Tools are the only way an agent interacts with the world. Nova mandates **Zod Schemas** for all tools.

**Why Zod?**
LLMs are probabilistic. They make mistakes. Zod is deterministic. It enforces rules. By defining a Zod schema, you ensure that your tool function *never* executes with invalid data types, preventing crashes deep in your business logic.

## 4. The Memory: `ContextManager`

Memory in Nova is multi-tiered:
-   **Buffer Memory (RAM)**: Holds the current request's 10-20 turns. Fast, but transient.
-   **KV Storage (Long-term)**: Persists session state across Worker invocations.
-   **Semantic Search (SMS)**: (Internal Tool) "The Hippocampus". If enabled, the agent can use an internal tool (`SMS`) to search *all* past conversations using vector embeddings to find relevant details ("What was the user's name mentioned 3 weeks ago?").

---

<a name="part-iv-building-agents"></a>
# Part IV: Building Agents

## Tutorial: The Financial Analyst

Let's build a robust agent.

### 1. Define the Agent File
Create `src/financial_agent.js`.

```javascript
import { Pipeline } from 'nova-agent-framework/core/pipeline';
import { z } from 'zod';

export default async function financialAgent(req, env) {
    // ...
}
```

### 2. Create Tools

```javascript
const stockTool = {
    name: "get_stock_quote",
    description: "Get real-time price data for a stock ticker symbol.",
    schema: z.object({
        symbol: z.string().describe("The stock ticker, e.g. AAPL, NVDA"),
        market: z.enum(["US", "UK"]).optional().describe("Market region")
    }),
    func: async ({ symbol, market }) => {
        // Fetch logic would go here
        return JSON.stringify({ symbol, price: 145.20, currency: "USD" });
    }
};
```

### 3. Initialize Pipeline

```javascript
const agent = new Pipeline({
    // Enable debug logging?
    verbose: env.VERBOSE === 'true',
    
    // Tools Array
    tools: [stockTool],

    // Memory Setup
    ctxManagerConfig: {
        clientId: "user_01",
        agentId: "finance_bot_v1",
        memory: {
            memoryType: "buffer",
            limitTurns: 15, // Keep plenty of context
            kvNamespace: env.KV_NAMESPACE
        }
    },

    // LLM Setup
    llmConfig: {
        model: env.LLM_MODEL, // "openai/gpt-4o"
        api_keys: {
            openai: env.OPENAI_API_KEY
        }
    }
});
```

### 4. Run & Return

```javascript
try {
    const input = await req.json();
    const result = await agent.run(input.prompt);
    return new Response(result);
} catch (err) {
    return new Response(err.message, { status: 500 });
}
```

---

<a name="part-v-api-reference"></a>
# Part V: API Reference

## Class: `Pipeline`

### `constructor(config: PipelineConfig)`
| Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `config.verbose` | `boolean` | No | Enables detailed debug logging (payloads, timings). |
| `config.tools` | `Tool[]` | No | Array of tool definitions. |
| `config.maxToolLoop`| `number` | No | Max consecutive tool calls (default: 6). |
| `config.llmConfig` | `LLMConfig`| Yes | Configuration for the model provider. |
| `config.ctxManagerConfig` | `CtxConfig` | Yes | Configuration for memory and session IDs. |

### `run(prompt: string): Promise<string>`
Executes the main reasoning loop. Returns the final text response.

---

## Class: `ChatLLM`

### `constructor(config: LLMConfig)`
| Param | Type | Description |
| :--- | :--- | :--- |
| `config.model` | `string` | The model ID string (e.g. `gpt-4o`, `groq/llama...`). |
| `config.api_keys` | `Object` | Keys `{ openai, groq, gemini }`. |
| `config.cloudflare`| `Object` | `{ accountId, gatewayId, cfAIGToken }`. |

### `chat(messages: Message[], options: ChatOptions): Promise<LLMResult>`
Low-level wrapper for model inference.
- `options.tools`: Array of JSON-Schema tool definitions.
- `options.toolChoice`: usually `'auto'`.

---

## Class: `ContextManager`

### `constructor(config: CtxConfig)`
| Param | Type | Description |
| :--- | :--- | :--- |
| `config.clientId` | `string` | Unique ID for the *User*. |
| `config.agentId` | `string` | Unique ID for the *Agent*. |
| `config.memory.kvNamespace` | `KVNamespace` | The Cloudflare KV binding object. |

---

<a name="part-vi-deployment"></a>

# Part VI: Observability & Deployment

## Logging Standards
Nova uses a centralized logging system. To see logs in production, use:

```bash
npx wrangler tail
```

Look for the structured blocks:
- `🔄 LOOP START`: Indicates a new reasoning cycle.
- `🛠️ Tool Execution`: Indicates a tool is running.
- `✅ Self-Heal`: Indicates the framework repaired a broken LLM response.

## Security Best Practices
1.  **Secret Rotation**: Use `wrangler secret put` for API keys. Do not store them in `wrangler.toml` plain text.
2.  **Validation**: Trust Zod. Do not "trust" the LLM's output inside your tool functions. Always re-validate if critical.
3.  **Timeouts**: Cloudflare Workers have CPU time limits (usually 10ms-50ms CPU time, but long wall-time for async). Nova is optimized for this, but heavy synchronous logic in tools can crash the worker.

---
**Maintained by**: Godwin Austen Labs  
**Date**: 2026-02-04
