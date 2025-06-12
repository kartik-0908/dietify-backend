// Main graph
import dotenv from "dotenv";
dotenv.config();

import {
  LangGraphRunnableConfig,
  START,
  StateGraph,
  END,
} from "@langchain/langgraph";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { initializeTools } from "./tools";
import {
  ConfigurationAnnotation,
  ensureConfiguration,
} from "./configuration";
import { GraphAnnotation } from "./state";
import { getStoreFromConfigOrThrow, splitModelAndProvider } from "./utils";
import { AzureChatOpenAI } from "@langchain/openai";


const llm = new AzureChatOpenAI({
  temperature: 0.9,
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY, // In Node.js defaults to process.env.AZURE_OPENAI_API_KEY
  azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME, // In Node.js defaults to process.env.AZURE_OPENAI_API_INSTANCE_NAME
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME, // In Node.js defaults to process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION, // In Node.js defaults to process.env.AZURE_OPENAI_API_VERSION
});

async function callModel(
  state: typeof GraphAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<{ messages: BaseMessage[] }> {
  const store = getStoreFromConfigOrThrow(config);
  const configurable = ensureConfiguration(config);
  // console.log("Configurable:", configurable);
  const memories = await store.search(["memories", configurable.userId], {
    limit: 10,
  });

  let formatted =
    memories
      ?.map((mem) => `[${mem.key}]: ${JSON.stringify(mem.value)}`)
      ?.join("\n") || "";
  if (formatted) {
    formatted = `\n<memories>\n${formatted}\n</memories>`;
  }

  const sys = configurable.systemPrompt
    .replace("{user_info}", formatted)
    .replace("{time}", new Date().toISOString());

  const tools = initializeTools(config);
  const boundLLM = llm.bind({
    tools: tools,
    tool_choice: "auto",
  });

  const result = await boundLLM.invoke(
    [{ role: "system", content: sys }, ...state.messages],
    {
      configurable: splitModelAndProvider(configurable.model),
    },
  );

  return { messages: [result] };
}

async function storeData(
  state: typeof GraphAnnotation.State,
  config: LangGraphRunnableConfig,
): Promise<{ messages: BaseMessage[] }> {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls || [];

  const tools = initializeTools(config);
  
  // Create a map of tool names to tool functions for easy lookup
  const toolMap = new Map();
  tools.forEach(tool => {
    toolMap.set(tool.name, tool);
  });

  const results = await Promise.all(
    toolCalls.map(async (tc) => {
      const tool = toolMap.get(tc.name);
      if (!tool) {
        throw new Error(`Tool ${tc.name} not found`);
      }
      return await tool.invoke(tc);
    }),
  );

  return { messages: results };
}

function routeMessage(
  state: typeof GraphAnnotation.State,
): "store_data" | typeof END {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls?.length) {
    return "store_data";
  }
  return END;
}

// Create the graph + all nodes
export const builder = new StateGraph(
  {
    stateSchema: GraphAnnotation,
  },
  ConfigurationAnnotation,
)
  .addNode("call_model", callModel)
  .addNode("store_data", storeData)
  .addEdge(START, "call_model")
  .addConditionalEdges("call_model", routeMessage, {
    store_data: "store_data",
    [END]: END,
  })
  .addEdge("store_data", "call_model");
import { InMemoryStore } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRESS_MEMORY_URL || '',
});

const checkpointer = new PostgresSaver(pool);

// NOTE: you need to call .setup() the first time you're using your checkpointer

checkpointer.setup();

const inMemoryStore = new InMemoryStore();
export const graph = builder.compile( {checkpointer: checkpointer,
  store: inMemoryStore,});