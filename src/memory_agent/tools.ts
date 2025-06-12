import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ensureConfiguration } from "./configuration";
import { v4 as uuidv4 } from "uuid";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getStoreFromConfigOrThrow } from "./utils";

/**
 * Initialize tools within a function so that they have access to the current
 * state and config at runtime.
 */
export function initializeTools(config?: LangGraphRunnableConfig) {
  /**
   * Upsert a memory in the database.
   * @param content The main content of the memory.
   * @param context Additional context for the memory.
   * @param memoryId Optional ID to overwrite an existing memory.
   * @returns A string confirming the memory storage.
   */
  async function upsertMemory(opts: {
    content: string;
    context: string;
    memoryId?: string;
  }): Promise<string> {
    const { content, context, memoryId } = opts;
    if (!config || !config.store) {
      throw new Error("Config or store not provided");
    }

    const configurable = ensureConfiguration(config);
    const memId = memoryId || uuidv4();
    const store = getStoreFromConfigOrThrow(config);

    await store.put(["memories", configurable.userId], memId, {
      content,
      context,
    });

    return `Stored memory ${memId}`;
  }

  /**
   * Save food intake to the database.
   * @param foodItem The name/description of the food consumed.
   * @param quantity The amount consumed (e.g., "1 cup", "2 slices", "100g").
   * @param calories Optional calorie count for the food item.
   * @param fats Optional fat content in grams.
   * @param carbs Optional carbohydrate content in grams.
   * @param proteins Optional protein content in grams.
   * @param timestamp Optional timestamp, defaults to current time.
   * @param entryId Optional ID to overwrite an existing entry.
   * @returns A string confirming the food intake storage.
   */
  async function saveFoodIntake(opts: {
    foodItem: string;
    quantity: string;
    calories?: number;
    fats?: number;
    carbs?: number;
    proteins?: number;
    timestamp?: string;
    entryId?: string;
  }): Promise<string> {
    const {
      foodItem,
      quantity,
      calories,
      fats,
      carbs,
      proteins,
      timestamp,
      entryId,
    } = opts;
    if (!config || !config.store) {
      throw new Error("Config or store not provided");
    }

    const configurable = ensureConfiguration(config);
    const entryIdFinal = entryId || uuidv4();
    const store = getStoreFromConfigOrThrow(config);
    const currentTimestamp = timestamp || new Date().toISOString();

    await store.put(["food_intake", configurable.userId], entryIdFinal, {
      foodItem,
      quantity,
      calories,
      fats,
      carbs,
      proteins,
      timestamp: currentTimestamp,
    });

    const nutritionInfo = [];
    if (calories) nutritionInfo.push(`${calories} calories`);
    if (fats) nutritionInfo.push(`${fats}g fats`);
    if (carbs) nutritionInfo.push(`${carbs}g carbs`);
    if (proteins) nutritionInfo.push(`${proteins}g proteins`);

    const nutritionString =
      nutritionInfo.length > 0 ? ` (${nutritionInfo.join(", ")})` : "";

    return `Stored food intake ${entryIdFinal}: ${quantity} of ${foodItem}${nutritionString}`;
  }

  /**
   * Save water intake to the database.
   * @param amount The amount of water consumed.
   * @param unit The unit of measurement (ml, oz, cups, liters, etc.).
   * @param timestamp Optional timestamp, defaults to current time.
   * @param entryId Optional ID to overwrite an existing entry.
   * @returns A string confirming the water intake storage.
   */
  async function saveWaterIntake(opts: {
    amount: number;
    unit: string;
    timestamp?: string;
    entryId?: string;
  }): Promise<string> {
    const { amount, unit, timestamp, entryId } = opts;
    if (!config || !config.store) {
      throw new Error("Config or store not provided");
    }

    const configurable = ensureConfiguration(config);
    const entryIdFinal = entryId || uuidv4();
    const store = getStoreFromConfigOrThrow(config);
    const currentTimestamp = timestamp || new Date().toISOString();

    await store.put(["water_intake", configurable.userId], entryIdFinal, {
      amount,
      unit,
      timestamp: currentTimestamp,
    });

    return `Stored water intake ${entryIdFinal}: ${amount} ${unit}`;
  }

  const upsertMemoryTool = tool(upsertMemory, {
    name: "upsertMemory",
    description:
      "Upsert a memory in the database. If a memory conflicts with an existing one, \
      update the existing one by passing in the memory_id instead of creating a duplicate. \
      If the user corrects a memory, update it. Can call multiple times in parallel \
      if you need to store or update multiple memories.",
    schema: z.object({
      content: z.string().describe(
        "The main content of the memory. For example: \
          'User expressed interest in learning about French.'"
      ),
      context: z.string().describe(
        "Additional context for the memory. For example: \
          'This was mentioned while discussing career options in Europe.'"
      ),
      memoryId: z
        .string()
        .optional()
        .describe(
          "The memory ID to overwrite. Only provide if updating an existing memory."
        ),
    }),
  });

  const saveFoodIntakeTool = tool(saveFoodIntake, {
    name: "saveFoodIntake",
    description:
      "Save food intake information to track what the user has eaten. \
      Use this when the user mentions eating something or wants to log their food. \
      Can be called multiple times to log different food items.",
    schema: z.object({
      foodItem: z.string().describe(
        "The name or description of the food consumed. For example: \
          'Apple', 'Chicken breast', 'Pasta with marinara sauce'"
      ),
      quantity: z.string().describe(
        "The amount consumed with units. For example: \
          '1 medium apple', '150g', '1 cup', '2 slices'"
      ),
      calories: z
        .number()
        .describe(
          "Optional calorie count for the food item if known or estimated."
        ),
      fats: z
        .number()
        .describe("Optional fat content in grams if known or estimated."),
      carbs: z
        .number()
        .describe(
          "Optional carbohydrate content in grams if known or estimated."
        ),
      proteins: z
        .number()
        .describe("Optional protein content in grams if known or estimated."),
      timestamp: z
        .string()
        .optional()
        .describe(
          "Optional ISO timestamp. If not provided, current time will be used."
        ),
      entryId: z
        .string()
        .optional()
        .describe(
          "The entry ID to overwrite. Only provide if updating an existing food entry."
        ),
    }),
  });

  const saveWaterIntakeTool = tool(saveWaterIntake, {
    name: "saveWaterIntake",
    description:
      "Save water intake information to track hydration. \
      Use this when the user mentions drinking water or other beverages for hydration tracking. \
      Can be called multiple times to log different water intake events.",
    schema: z.object({
      amount: z
        .number()
        .describe(
          "The numerical amount of water consumed. For example: 250, 8, 1.5"
        ),
      unit: z.string().describe(
        "The unit of measurement. For example: \
          'ml', 'oz', 'cups', 'liters', 'fl oz'"
      ),
      timestamp: z
        .string()
        .optional()
        .describe(
          "Optional ISO timestamp. If not provided, current time will be used."
        ),
      entryId: z
        .string()
        .optional()
        .describe(
          "The entry ID to overwrite. Only provide if updating an existing water intake entry."
        ),
    }),
  });

  return [upsertMemoryTool, saveFoodIntakeTool, saveWaterIntakeTool];
}
