// Define the configurable parameters for the agent

import { Annotation, LangGraphRunnableConfig } from "@langchain/langgraph";
import { SYSTEM_PROMPT } from "./prompts";

export const ConfigurationAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  thread_id: Annotation<string>(),
});

export type Configuration = typeof ConfigurationAnnotation.State;

export function ensureConfiguration(config?: LangGraphRunnableConfig) {
  const configurable = config?.configurable || {};
  return {
    thread_id: configurable?.threadId || "default",
    userId: configurable?.userId || "default",
    model: configurable?.model || "azure/gpt-4.1",
    systemPrompt: configurable?.systemPrompt || SYSTEM_PROMPT,
  };
}
