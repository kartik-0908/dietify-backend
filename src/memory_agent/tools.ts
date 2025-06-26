import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ensureConfiguration } from "./configuration";
import { v4 as uuidv4 } from "uuid";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getStoreFromConfigOrThrow } from "./utils";
import { prisma } from "../lib/prisma";

/**
 * Initialize tools within a function so that they have access to the current
 * state and config at runtime.
 */
export function initializeTools(config?: LangGraphRunnableConfig) {
  /**
   * Upsert a memory in the database (keeping the original memory functionality).
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
   * Save food intake to the PostgreSQL database.
   * @param foodItem The name/description of the food consumed.
   * @param quantity The amount consumed (e.g., "1 cup", "2 slices", "100g").
   * @param calories Optional calorie count for the food item.
   * @param fats Optional fat content in grams.
   * @param carbs Optional carbohydrate content in grams.
   * @param proteins Optional protein content in grams.
   * @param mealType Optional meal type (breakfast, lunch, dinner, snack).
   * @param timestamp Optional timestamp, defaults to current time.
   * @param notes Optional notes about the food intake.
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
    mealType?: "breakfast" | "lunch" | "dinner" | "snack";
    timestamp?: string;
    notes?: string;
  }): Promise<string> {
    const {
      foodItem,
      quantity,
      calories,
      fats,
      carbs,
      proteins,
      mealType,
      timestamp,
      notes,
    } = opts;

    try {
      const configurable = ensureConfiguration(config);
      const userId = configurable.userId;

      if (!userId) {
        throw new Error("User ID not found in configuration");
      }

      // Parse quantity to extract numeric value and unit
      const quantityMatch = quantity.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
      const quantityValue = quantityMatch ? parseFloat(quantityMatch[1]) : null;
      const quantityUnit = quantityMatch
        ? quantityMatch[2].trim() || null
        : quantity;

      // Convert timestamp to Date object
      const consumedAt = timestamp ? new Date(timestamp) : new Date();

      // Determine meal type based on time if not provided
      const determinedMealType =
        mealType || determineMealTypeFromTime(consumedAt);

      // Create new entry
      const newEntry = await prisma.caloriesIntakeLog.create({
        data: {
          userId,
          foodItem,
          quantity: quantityValue?.toString() || "1",
          unit: quantityUnit,
          calories: calories || 0,
          carbs: carbs || null,
          proteins: proteins || null,
          fats: fats || null,
          mealType: determinedMealType,
          consumedAt,
          notes: notes || null,
          source: "conversation",
        },
      });

      const nutritionInfo = buildNutritionString(
        calories,
        fats,
        carbs,
        proteins
      );
      return `Stored food intake ${newEntry.id}: ${quantity} of ${foodItem}${nutritionInfo} for ${determinedMealType}`;
    } catch (error) {
      console.error("Error saving food intake:", error);
      return "some error occurred while saving food intake";
    }
  }

  /**
   * Save water intake to the PostgreSQL database.
   * @param amount The amount of water consumed.
   * @param unit The unit of measurement (ml, oz, cups, liters, etc.).
   * @param timestamp Optional timestamp, defaults to current time.
   * @param notes Optional notes about the water intake.
   * @param entryId Optional ID to overwrite an existing entry.
   * @returns A string confirming the water intake storage.
   */
  async function saveWaterIntake(opts: {
    amount: number;
    unit: string;
    timestamp?: string;
    notes?: string;
    entryId?: string;
  }): Promise<string> {
    const { amount, unit, timestamp, notes, entryId } = opts;

    try {
      const configurable = ensureConfiguration(config);
      const userId = configurable.userId;

      if (!userId) {
        throw new Error("User ID not found in configuration");
      }

      // Convert timestamp to Date object
      const consumedAt = timestamp ? new Date(timestamp) : new Date();

      // Normalize unit to ml or oz
      const normalizedUnit = normalizeWaterUnit(unit);
      const normalizedAmount = convertWaterAmount(amount, unit, normalizedUnit);

      if (entryId) {
        // Update existing entry
        const updatedEntry = await prisma.waterIntakeLog.update({
          where: { id: entryId },
          data: {
            amount: normalizedAmount,
            unit: normalizedUnit,
            consumedAt,
            notes: notes || null,
            source: "conversation",
          },
        });

        return `Updated water intake ${updatedEntry.id}: ${amount} ${unit} (${normalizedAmount} ${normalizedUnit})`;
      } else {
        // Create new entry
        const newEntry = await prisma.waterIntakeLog.create({
          data: {
            userId,
            amount: normalizedAmount,
            unit: normalizedUnit,
            consumedAt,
            notes: notes || null,
            source: "conversation",
          },
        });

        return `Stored water intake ${newEntry.id}: ${amount} ${unit} (${normalizedAmount} ${normalizedUnit})`;
      }
    } catch (error) {
      console.error("Error saving water intake:", error);
      return "some error occurred while saving water intake";
    }
  }

  // Helper functions
  function determineMealTypeFromTime(date: Date): string {
    const hour = date.getHours();
    if (hour >= 5 && hour < 11) return "breakfast";
    if (hour >= 11 && hour < 16) return "lunch";
    if (hour >= 16 && hour < 22) return "dinner";
    return "snack";
  }

  function buildNutritionString(
    calories?: number,
    fats?: number,
    carbs?: number,
    proteins?: number
  ): string {
    const nutritionInfo = [];
    if (calories) nutritionInfo.push(`${calories} calories`);
    if (fats) nutritionInfo.push(`${fats}g fats`);
    if (carbs) nutritionInfo.push(`${carbs}g carbs`);
    if (proteins) nutritionInfo.push(`${proteins}g proteins`);
    return nutritionInfo.length > 0 ? ` (${nutritionInfo.join(", ")})` : "";
  }

  function normalizeWaterUnit(unit: string): string {
    const normalizedUnit = unit.toLowerCase().trim();
    if (["ml", "milliliter", "milliliters"].includes(normalizedUnit))
      return "ml";
    if (
      [
        "oz",
        "fl oz",
        "fluid ounce",
        "fluid ounces",
        "ounce",
        "ounces",
      ].includes(normalizedUnit)
    )
      return "oz";
    if (["cup", "cups"].includes(normalizedUnit)) return "ml"; // Convert cups to ml
    if (["liter", "liters", "l"].includes(normalizedUnit)) return "ml"; // Convert liters to ml
    return "ml"; // Default to ml
  }

  function convertWaterAmount(
    amount: number,
    fromUnit: string,
    toUnit: string
  ): number {
    const normalizedFromUnit = fromUnit.toLowerCase().trim();

    // Convert everything to ml first
    let mlAmount = amount;
    if (
      [
        "oz",
        "fl oz",
        "fluid ounce",
        "fluid ounces",
        "ounce",
        "ounces",
      ].includes(normalizedFromUnit)
    ) {
      mlAmount = amount * 29.5735;
    } else if (["cup", "cups"].includes(normalizedFromUnit)) {
      mlAmount = amount * 250; // 1 cup = 250ml
    } else if (["liter", "liters", "l"].includes(normalizedFromUnit)) {
      mlAmount = amount * 1000;
    }

    // Convert from ml to target unit
    if (toUnit === "oz") {
      return Math.round((mlAmount / 29.5735) * 100) / 100;
    }
    return Math.round(mlAmount);
  }

  // Define the tools
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
      "Save food intake information to the PostgreSQL database to track what the user has eaten. \
      Use this when the user mentions eating something or wants to log their food. \
      The system will automatically determine meal type based on time if not specified. \
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

        .describe(" calorie count for the food item if known or estimated."),
      fats: z
        .number()

        .describe(" fat content in grams if known or estimated."),
      carbs: z
        .number()

        .describe(" carbohydrate content in grams if known or estimated."),
      proteins: z
        .number()

        .describe(" protein content in grams if known or estimated."),
      mealType: z
        .enum(["breakfast", "lunch", "dinner", "snack"])
        .optional()
        .describe(
          "Optional meal type. If not provided, will be determined based on current time."
        ),
      timestamp: z
        .string()
        .optional()
        .describe(
          "Optional ISO timestamp. If not provided, current time will be used."
        ),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about the food intake."),
    }),
  });

  const saveWaterIntakeTool = tool(saveWaterIntake, {
    name: "saveWaterIntake",
    description:
      "Save water intake information to the PostgreSQL database to track hydration. \
      Use this when the user mentions drinking water or other beverages for hydration tracking. \
      The system will automatically normalize units to ml or oz. \
      Can be called multiple times to log different water intake events.",
    schema: z.object({
      amount: z
        .number()
        .describe(
          "The numerical amount of water consumed. For example: 250, 8, 1.5"
        ),
      unit: z.string().describe(
        "The unit of measurement. For example: \
          'ml', 'oz', 'cups', 'liters', 'fl oz'. Will be normalized to ml or oz."
      ),
      timestamp: z
        .string()
        .optional()
        .describe(
          "Optional ISO timestamp. If not provided, current time will be used."
        ),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about the water intake."),
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
