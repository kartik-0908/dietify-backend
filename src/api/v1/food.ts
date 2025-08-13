// routes/food.ts
import { Response, Router } from "express";
import { authenticateToken } from "../../lib/auth";
import { AuthenticatedRequest } from "../../types/user";
import { prisma } from "../../lib/prisma";

const router = Router();

// GET /food/today - Get today's food intake for authenticated user
router.get(
  "/today",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { date } = req.query as { date?: string };

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      // Use today's date if not provided
      const targetDate = date || getTodayDateString();

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(targetDate)) {
        res.status(400).json({
          success: false,
          message: "Invalid date format. Use YYYY-MM-DD",
        });
        return;
      }

      // Parse the date and create date range for the entire day
      const parsedDate = new Date(targetDate);
      if (isNaN(parsedDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date provided",
        });
        return;
      }

      // Create start and end of day in UTC (adjusted for IST timezone)
      const startOfDay = new Date(parsedDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      startOfDay.setMinutes(startOfDay.getMinutes() - 330); // IST offset

      const endOfDay = new Date(parsedDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      endOfDay.setMinutes(endOfDay.getMinutes() - 330); // IST offset

      console.log(`📅 Fetching food data for ${targetDate} (${startOfDay} to ${endOfDay})`);

      // Fetch today's calorie intake logs
      const foodLogs = await prisma.caloriesIntakeLog.findMany({
        where: {
          userId: userId,
          consumedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        select: {
          id: true,
          calories: true,
          foodItem: true,
          quantity: true,
          unit: true,
          mealType: true,
          carbs: true,
          proteins: true,
          fats: true,
          consumedAt: true,
          notes: true,
          source: true,
        },
        orderBy: {
          consumedAt: "asc",
        },
      });

      // Get user's calorie target
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { calorieTarget: true },
      });

      // Transform data to match Flutter app format
      const foodItems = foodLogs.map((log) => ({
        id: log.id,
        name: log.foodItem,
        calories: Number(log.calories),
        protein: log.proteins ? Number(log.proteins) : 0,
        carbs: log.carbs ? Number(log.carbs) : 0,
        fats: log.fats ? Number(log.fats) : 0,
        time: formatTime(log.consumedAt),
        portion: log.quantity && log.unit ? `${log.quantity} ${log.unit}` : "1 serving",
        mealType: log.mealType,
        notes: log.notes,
        source: log.source,
      }));

      // Calculate totals
      const totalCalories = foodItems.reduce((sum, item) => sum + item.calories, 0);
      const totalProtein = foodItems.reduce((sum, item) => sum + item.protein, 0);
      const totalCarbs = foodItems.reduce((sum, item) => sum + item.carbs, 0);
      const totalFats = foodItems.reduce((sum, item) => sum + item.fats, 0);

      console.log(`🍎 Found ${foodItems.length} food items with ${totalCalories} total calories for user ${userId}`);

      res.json({
        success: true,
        message: "Food data retrieved successfully",
        data: {
          date: targetDate,
          foodItems,
          summary: {
            totalCalories,
            totalProtein: Math.round(totalProtein * 10) / 10,
            totalCarbs: Math.round(totalCarbs * 10) / 10,
            totalFats: Math.round(totalFats * 10) / 10,
            calorieTarget: user?.calorieTarget || 2000,
          },
        },
      });
    } catch (error) {
      console.error("Get Today's Food Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

// POST /food - Add new food item
router.post(
  "/",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const {
        foodItem,
        calories,
        proteins,
        carbs,
        fats,
        quantity,
        unit,
        mealType,
        consumedAt,
        notes,
      } = req.body;

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      if (!foodItem || !calories) {
        res.status(400).json({
          success: false,
          message: "Food item name and calories are required",
        });
        return;
      }

      // Validate calories
      const caloriesNum = Number(calories);
      if (isNaN(caloriesNum) || caloriesNum < 0) {
        res.status(400).json({
          success: false,
          message: "Calories must be a valid positive number",
        });
        return;
      }

      // Validate consumed date
      let consumedDate = new Date();
      if (consumedAt) {
        consumedDate = new Date(consumedAt);
        if (isNaN(consumedDate.getTime())) {
          res.status(400).json({
            success: false,
            message: "Invalid consumed date format",
          });
          return;
        }
      }

      const newFoodLog = await prisma.caloriesIntakeLog.create({
        data: {
          userId,
          foodItem: foodItem.trim(),
          calories: caloriesNum,
          proteins: proteins ? Number(proteins) : null,
          carbs: carbs ? Number(carbs) : null,
          fats: fats ? Number(fats) : null,
          quantity: quantity ? Number(quantity) : null,
          unit: unit?.trim() || null,
          mealType: mealType || "snack",
          consumedAt: consumedDate,
          notes: notes?.trim() || null,
          source: "app",
        },
      });

      console.log(`✅ Added food item: ${foodItem} (${caloriesNum} cal) for user ${userId}`);

      res.json({
        success: true,
        message: "Food item added successfully",
        data: {
          id: newFoodLog.id,
          name: newFoodLog.foodItem,
          calories: Number(newFoodLog.calories),
          protein: newFoodLog.proteins ? Number(newFoodLog.proteins) : 0,
          carbs: newFoodLog.carbs ? Number(newFoodLog.carbs) : 0,
          fats: newFoodLog.fats ? Number(newFoodLog.fats) : 0,
          time: formatTime(newFoodLog.consumedAt),
          portion: newFoodLog.quantity && newFoodLog.unit 
            ? `${newFoodLog.quantity} ${newFoodLog.unit}` 
            : "1 serving",
          mealType: newFoodLog.mealType,
          notes: newFoodLog.notes,
        },
      });
    } catch (error) {
      console.error("Add Food Item Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

// PUT /food/:id - Update food item
router.put(
  "/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;
      const {
        foodItem,
        calories,
        proteins,
        carbs,
        fats,
        quantity,
        unit,
        mealType,
        notes,
      } = req.body;

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          success: false,
          message: "Food item ID is required",
        });
        return;
      }

      // Check if food log belongs to user
      const existingLog = await prisma.caloriesIntakeLog.findFirst({
        where: { id, userId },
      });

      if (!existingLog) {
        res.status(404).json({
          success: false,
          message: "Food item not found or access denied",
        });
        return;
      }

      // Validate calories if provided
      let caloriesNum = Number(existingLog.calories);
      if (calories !== undefined) {
        caloriesNum = Number(calories);
        if (isNaN(caloriesNum) || caloriesNum < 0) {
          res.status(400).json({
            success: false,
            message: "Calories must be a valid positive number",
          });
          return;
        }
      }

      const updatedFoodLog = await prisma.caloriesIntakeLog.update({
        where: { id },
        data: {
          foodItem: foodItem?.trim() || existingLog.foodItem,
          calories: caloriesNum,
          proteins: proteins !== undefined ? (proteins ? Number(proteins) : null) : existingLog.proteins,
          carbs: carbs !== undefined ? (carbs ? Number(carbs) : null) : existingLog.carbs,
          fats: fats !== undefined ? (fats ? Number(fats) : null) : existingLog.fats,
          quantity: quantity !== undefined ? (quantity ? Number(quantity) : null) : existingLog.quantity,
          unit: unit !== undefined ? (unit?.trim() || null) : existingLog.unit,
          mealType: mealType || existingLog.mealType,
          notes: notes !== undefined ? (notes?.trim() || null) : existingLog.notes,
        },
      });

      console.log(`✏️ Updated food item: ${updatedFoodLog.foodItem} for user ${userId}`);

      res.json({
        success: true,
        message: "Food item updated successfully",
        data: {
          id: updatedFoodLog.id,
          name: updatedFoodLog.foodItem,
          calories: Number(updatedFoodLog.calories),
          protein: updatedFoodLog.proteins ? Number(updatedFoodLog.proteins) : 0,
          carbs: updatedFoodLog.carbs ? Number(updatedFoodLog.carbs) : 0,
          fats: updatedFoodLog.fats ? Number(updatedFoodLog.fats) : 0,
          time: formatTime(updatedFoodLog.consumedAt),
          portion: updatedFoodLog.quantity && updatedFoodLog.unit 
            ? `${updatedFoodLog.quantity} ${updatedFoodLog.unit}` 
            : "1 serving",
          mealType: updatedFoodLog.mealType,
          notes: updatedFoodLog.notes,
        },
      });
    } catch (error) {
      console.error("Update Food Item Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

// DELETE /food/:id - Delete food item
router.delete(
  "/:id",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      if (!id) {
        res.status(400).json({
          success: false,
          message: "Food item ID is required",
        });
        return;
      }

      // Check if food log belongs to user
      const existingLog = await prisma.caloriesIntakeLog.findFirst({
        where: { id, userId },
      });

      if (!existingLog) {
        res.status(404).json({
          success: false,
          message: "Food item not found or access denied",
        });
        return;
      }

      await prisma.caloriesIntakeLog.delete({
        where: { id },
      });

      console.log(`🗑️ Deleted food item: ${existingLog.foodItem} for user ${userId}`);

      res.json({
        success: true,
        message: "Food item deleted successfully",
      });
    } catch (error) {
      console.error("Delete Food Item Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

// Helper functions
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata', // IST timezone
  });
}

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

module.exports = router;