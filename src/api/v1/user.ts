import { Response, Router } from "express";
import {
  AuthenticatedRequest,
  OnboardingRequest,
  OnboardingResponse,
} from "../../types/user";
import { authenticateToken } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { console } from "inspector";
const router = Router();

// Complete Onboarding Route
router.post(
  "/onboarding",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      console.log("Received Onboarding Request:", req);
      const userId = req.user?.userId; // From JWT token middleware
      const onboardingData = req.body as OnboardingRequest;

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        } as OnboardingResponse);
        return;
      }

      // Validate required fields
      const { basicInfo, physicalInfo, healthInfo, dietaryInfo, fitnessInfo } =
        onboardingData;

      if (!basicInfo?.name || !basicInfo?.gender) {
        res.status(400).json({
          success: false,
          message: "Basic information (name, age, gender) is required",
        } as OnboardingResponse);
        return;
      }

      if (!physicalInfo?.height || !physicalInfo?.weight) {
        res.status(400).json({
          success: false,
          message: "Physical information (height, weight) is required",
        } as OnboardingResponse);
        return;
      }

      if (!fitnessInfo?.fitnessGoal) {
        res.status(400).json({
          success: false,
          message: "Fitness goal is required",
        } as OnboardingResponse);
        return;
      }

      // Get existing user
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!existingUser) {
        res.status(404).json({
          success: false,
          message: "User not found",
        } as OnboardingResponse);
        return;
      }

      // Prepare user profile data
      const profileData = {
        // Basic Info
        name: basicInfo.name,
        dateOfBirth: basicInfo.dateOfBirth,
        gender: basicInfo.gender,

        // Physical Info
        height: physicalInfo.height.toString() + physicalInfo.heightUnit,
        heightUnit: physicalInfo.heightUnit || "cm",
        weight: physicalInfo.weight.toString(),

        // Health Info
        medicalConditions: healthInfo.medicalConditions || [],
        activityLevel: healthInfo.activityLevel,

        // Dietary Info
        dietaryPreference: dietaryInfo.dietaryPreference,
        likedFoods: dietaryInfo.likedFoods || [],
        dislikedFoods: dietaryInfo.dislikedFoods || [],

        // Fitness Info
        fitnessGoal: fitnessInfo.fitnessGoal,

        // Meta
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      };

      // Update user with onboarding data
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          name: profileData.name,
          dateOfBirth: profileData.dateOfBirth,
          gender: profileData.gender,
          height: profileData.height,
          weight: profileData.weight,
          medicalConditions: profileData.medicalConditions,
          activityLevel: profileData.activityLevel,
          dietaryPreference: profileData.dietaryPreference,
          foodLiking: profileData.likedFoods,
          foodDisliking: profileData.dislikedFoods,
          fitnessGoal: profileData.fitnessGoal,
          onboardingCompleted: true,
        },
      });

      console.log(`✅ Onboarding completed for user: ${existingUser.email}`);

      res.json({
        success: true,
        message: "Onboarding completed successfully",
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            onboardingCompleted: true,
            profile: {
              name: updatedUser.name,
              gender: updatedUser.gender,
              height: updatedUser.height,
              weight: updatedUser.weight,
              fitnessGoal: updatedUser.fitnessGoal,
              dietaryPreference: updatedUser.dietaryPreference,
            },
          },
        },
      } as OnboardingResponse);
    } catch (error) {
      console.error("Complete Onboarding Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      } as OnboardingResponse);
    }
  }
);

router.get(
  "/calories",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { date } = req.query as { date?: string };
      console.log(date)

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      if (!date) {
        res.status(400).json({
          success: false,
          message: "Date parameter is required. Use ?date=YYYY-MM-DD",
        });
        return;
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        res.status(400).json({
          success: false,
          message: "Invalid date format. Use YYYY-MM-DD",
        });
        return;
      }

      // Parse the date and create date range for the entire day
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date provided",
        });
        return;
      }

      // Create start and end of day in UTC
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      startOfDay.setMinutes(startOfDay.getMinutes() - 330);


      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      endOfDay.setMinutes(startOfDay.getMinutes() - 330);

      console.log(startOfDay, endOfDay);

      // Get the total calories using aggregation
      const result = await prisma.caloriesIntakeLog.aggregate({
        where: {
          userId: userId,
          consumedAt: {
            gte: startOfDay , // Adjust for timezone offset
            lte: endOfDay,
          },
        },
        _sum: {
          calories: true,
          carbs: true,
          proteins: true,
          fats: true,
        },
        _count: {
          id: true,
        },
      });

      const totalCalories = Number(result._sum.calories || 0);
      const totalCarbs = Number(result._sum.carbs || 0);
      const totalProteins = Number(result._sum.proteins || 0);
      const totalFats = Number(result._sum.fats || 0);
      const entryCount = result._count.id;
      console.log("just before")

      console.log(
        `📊 Total calories for user ${userId} on ${date}: ${totalCalories} calories`
      );

      res.json({
        success: true,
        message: "Total calorie intake retrieved successfully",
        data: {
          date: date,
          totalCalories: Math.round(totalCalories * 100) / 100,
          totalMacros: {
            carbs: Math.round(totalCarbs * 100) / 100,
            proteins: Math.round(totalProteins * 100) / 100,
            fats: Math.round(totalFats * 100) / 100,
          },
          entryCount: entryCount,
        },
      });
    } catch (error) {
      console.error("Get Total Calorie Intake Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

router.get(
  "/water",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { date } = req.query as { date?: string };
      console.log("water :",date)

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      if (!date) {
        res.status(400).json({
          success: false,
          message: "Date parameter is required. Use ?date=YYYY-MM-DD",
        });
        return;
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        res.status(400).json({
          success: false,
          message: "Invalid date format. Use YYYY-MM-DD",
        });
        return;
      }

      // Parse the date and create date range for the entire day
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date provided",
        });
        return;
      }

      // Create start and end of day in UTC
      const startOfDay = new Date(targetDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      startOfDay.setMinutes(startOfDay.getMinutes() - 330); // Adjust for timezone offset

      const endOfDay = new Date(targetDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      endOfDay.setMinutes(startOfDay.getMinutes() - 330); // Adjust for timezone offset

      // Get all water intake logs for the date
      const waterIntakeLogs = await prisma.waterIntakeLog.findMany({
        where: {
          userId: userId,
          consumedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        select: {
          amount: true,
          unit: true,
        },
      });

      // Convert all amounts to ml for calculation
      const convertToMl = (amount: number, unit: string): number => {
        if (unit === "oz") {
          return amount * 29.5735; // 1 oz = 29.5735 ml
        }
        return amount; // Already in ml
      };

      // Calculate totals
      const totalMl = waterIntakeLogs.reduce((total, log) => {
        return total + convertToMl(Number(log.amount), log.unit);
      }, 0);

      const totalOz = totalMl / 29.5735;
      const totalLiters = totalMl / 1000;

      // Calculate progress towards daily goal
      const dailyGoalMl = 2000;
      const progressPercentage = Math.min((totalMl / dailyGoalMl) * 100, 100);

      console.log(
        `💧 Total water intake for user ${userId} on ${date}: ${Math.round(totalMl)}ml`
      );

      res.json({
        success: true,
        message: "Total water intake retrieved successfully",
        data: {
          date: date,
          totalIntake: {
            ml: Math.round(totalMl),
            oz: Math.round(totalOz * 100) / 100,
            liters: Math.round(totalLiters * 100) / 100,
          },
          dailyGoal: {
            ml: dailyGoalMl,
            progress: Math.round(progressPercentage * 100) / 100,
            achieved: progressPercentage >= 100,
          },
          entryCount: waterIntakeLogs.length,
        },
      });
    } catch (error) {
      console.error("Get Total Water Intake Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

router.get(
  "/calories/all",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { limit, offset } = req.query as {
        limit?: string;
        offset?: string;
      };

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      // Parse pagination parameters
      const limitNum = limit ? parseInt(limit, 10) : 100; // Default limit of 100
      const offsetNum = offset ? parseInt(offset, 10) : 0; // Default offset of 0

      // Validate pagination parameters
      if (limitNum < 1 || limitNum > 1000) {
        res.status(400).json({
          success: false,
          message: "Limit must be between 1 and 1000",
        });
        return;
      }

      if (offsetNum < 0) {
        res.status(400).json({
          success: false,
          message: "Offset must be 0 or greater",
        });
        return;
      }

      // Query all calorie intake logs for the user
      const calorieIntakeLogs = await prisma.caloriesIntakeLog.findMany({
        where: {
          userId: userId,
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
          createdAt: true,
          notes: true,
          source: true,
        },
        orderBy: {
          consumedAt: "desc", // Most recent first
        },
        take: limitNum,
        skip: offsetNum,
      });

      // Get total count for pagination info
      const totalCount = await prisma.caloriesIntakeLog.count({
        where: {
          userId: userId,
        },
      });

      // Calculate totals for summary
      const allLogs = await prisma.caloriesIntakeLog.findMany({
        where: { userId: userId },
        select: {
          calories: true,
          carbs: true,
          proteins: true,
          fats: true,
        },
      });

      const totals = allLogs.reduce(
        (acc, log) => ({
          calories: acc.calories + Number(log.calories),
          carbs: acc.carbs + Number(log.carbs || 0),
          proteins: acc.proteins + Number(log.proteins || 0),
          fats: acc.fats + Number(log.fats || 0),
        }),
        { calories: 0, carbs: 0, proteins: 0, fats: 0 }
      );

      console.log(
        `📊 Retrieved ${calorieIntakeLogs.length} calorie logs for user ${userId}`
      );

      res.json({
        success: true,
        message: "Calorie intake logs retrieved successfully",
        data: {
          logs: calorieIntakeLogs.map((log) => ({
            id: log.id,
            foodItem: log.foodItem,
            calories: Number(log.calories),
            quantity: log.quantity ? Number(log.quantity) : null,
            unit: log.unit,
            mealType: log.mealType,
            macros: {
              carbs: log.carbs ? Number(log.carbs) : null,
              proteins: log.proteins ? Number(log.proteins) : null,
              fats: log.fats ? Number(log.fats) : null,
            },
            consumedAt: log.consumedAt,
            createdAt: log.createdAt,
            notes: log.notes,
            source: log.source,
          })),
          pagination: {
            currentPage: Math.floor(offsetNum / limitNum) + 1,
            totalPages: Math.ceil(totalCount / limitNum),
            totalCount: totalCount,
            limit: limitNum,
            offset: offsetNum,
            hasNext: offsetNum + limitNum < totalCount,
            hasPrevious: offsetNum > 0,
          },
          summary: {
            totalCalories: Math.round(totals.calories * 100) / 100,
            totalMacros: {
              carbs: Math.round(totals.carbs * 100) / 100,
              proteins: Math.round(totals.proteins * 100) / 100,
              fats: Math.round(totals.fats * 100) / 100,
            },
            totalEntries: totalCount,
          },
        },
      });
    } catch (error) {
      console.error("Get All Calorie Logs Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

// Get all water intake logs for a user (ordered by most recent first)
router.get(
  "/water/all",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { limit, offset } = req.query as {
        limit?: string;
        offset?: string;
      };

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      // Parse pagination parameters
      const limitNum = limit ? parseInt(limit, 10) : 100; // Default limit of 100
      const offsetNum = offset ? parseInt(offset, 10) : 0; // Default offset of 0

      // Validate pagination parameters
      if (limitNum < 1 || limitNum > 1000) {
        res.status(400).json({
          success: false,
          message: "Limit must be between 1 and 1000",
        });
        return;
      }

      if (offsetNum < 0) {
        res.status(400).json({
          success: false,
          message: "Offset must be 0 or greater",
        });
        return;
      }

      // Query all water intake logs for the user
      const waterIntakeLogs = await prisma.waterIntakeLog.findMany({
        where: {
          userId: userId,
        },
        select: {
          id: true,
          amount: true,
          unit: true,
          consumedAt: true,
          createdAt: true,
          notes: true,
          source: true,
        },
        orderBy: {
          consumedAt: "desc", // Most recent first
        },
        take: limitNum,
        skip: offsetNum,
      });

      // Get total count for pagination info
      const totalCount = await prisma.waterIntakeLog.count({
        where: {
          userId: userId,
        },
      });

      // Calculate total water intake
      const allLogs = await prisma.waterIntakeLog.findMany({
        where: { userId: userId },
        select: {
          amount: true,
          unit: true,
        },
      });

      // Convert all amounts to ml for calculation
      const convertToMl = (amount: number, unit: string): number => {
        if (unit === "oz") {
          return amount * 29.5735; // 1 oz = 29.5735 ml
        }
        return amount; // Already in ml
      };

      const totalMl = allLogs.reduce((total, log) => {
        return total + convertToMl(Number(log.amount), log.unit);
      }, 0);

      const totalOz = totalMl / 29.5735;
      const totalLiters = totalMl / 1000;

      console.log(
        `💧 Retrieved ${waterIntakeLogs.length} water intake logs for user ${userId}`
      );

      res.json({
        success: true,
        message: "Water intake logs retrieved successfully",
        data: {
          logs: waterIntakeLogs.map((log) => ({
            id: log.id,
            amount: Number(log.amount),
            unit: log.unit,
            amountInMl: Math.round(convertToMl(Number(log.amount), log.unit)),
            amountInOz:
              Math.round(
                (convertToMl(Number(log.amount), log.unit) / 29.5735) * 100
              ) / 100,
            consumedAt: log.consumedAt,
            createdAt: log.createdAt,
            notes: log.notes,
            source: log.source,
          })),
          pagination: {
            currentPage: Math.floor(offsetNum / limitNum) + 1,
            totalPages: Math.ceil(totalCount / limitNum),
            totalCount: totalCount,
            limit: limitNum,
            offset: offsetNum,
            hasNext: offsetNum + limitNum < totalCount,
            hasPrevious: offsetNum > 0,
          },
          summary: {
            totalIntake: {
              ml: Math.round(totalMl),
              oz: Math.round(totalOz * 100) / 100,
              liters: Math.round(totalLiters * 100) / 100,
            },
            totalEntries: totalCount,
            averagePerEntry: {
              ml:
                totalCount > 0
                  ? Math.round((totalMl / totalCount) * 100) / 100
                  : 0,
              oz:
                totalCount > 0
                  ? Math.round((totalOz / totalCount) * 100) / 100
                  : 0,
            },
          },
        },
      });
    } catch (error) {
      console.error("Get All Water Intake Logs Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

// Add this route to your existing router

router.get(
  "/profile",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      // Get user profile from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          dateOfBirth: true,
          weight: true,
          height: true,
          mobileNumber: true,
          stepTarget: true,
          calorieTarget: true,
          dietaryPreference: true,
          medicalConditions: true,
          foodLiking: true,
          foodDisliking: true,
          fitnessGoal: true,
          activityLevel: true,
          gender: true,
          verified: true,
          isNewUser: true,
          onboardingCompleted: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        res.status(404).json({
          success: false,
          message: "User profile not found",
        });
        return;
      }

      // Calculate age from dateOfBirth if available
      let age: number | null = null;
      if (user.dateOfBirth) {
        const birthDate = new Date(user.dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }

      console.log(`👤 Retrieved profile for user: ${user.email}`);

      res.json({
        success: true,
        message: "User profile retrieved successfully",
        data: {
          user: {
            id: user.id,
            email: user.email,
            personalInfo: {
              name: user.name,
              dateOfBirth: user.dateOfBirth,
              age: age,
              gender: user.gender,
              mobileNumber: user.mobileNumber,
            },
            physicalInfo: {
              height: user.height,
              weight: user.weight,
            },
            healthInfo: {
              medicalConditions: user.medicalConditions || [],
              activityLevel: user.activityLevel,
            },
            dietaryInfo: {
              dietaryPreference: user.dietaryPreference,
              foodLiking: user.foodLiking || [],
              foodDisliking: user.foodDisliking || [],
            },
            fitnessInfo: {
              fitnessGoal: user.fitnessGoal,
              stepTarget: user.stepTarget,
              calorieTarget: user.calorieTarget,
            },
            accountInfo: {
              verified: user.verified,
              isNewUser: user.isNewUser,
              onboardingCompleted: user.onboardingCompleted,
              lastLoginAt: user.lastLoginAt,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
          },
        },
      });
    } catch (error) {
      console.error("Get User Profile Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);

// Add this route to your existing router (after the GET /profile route)

router.put(
  "/profile",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const updateData = req.body;

      // Validation
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Validate name if provided
      if (updateData.name && typeof updateData.name !== 'string') {
        res.status(400).json({
          success: false,
          message: "Name must be a string",
        });
        return;
      }

      // Validate mobile number if provided
      if (updateData.mobileNumber && typeof updateData.mobileNumber !== 'string') {
        res.status(400).json({
          success: false,
          message: "Mobile number must be a string",
        });
        return;
      }

      // Validate gender if provided
      if (updateData.gender && !['Male', 'Female', 'Other', 'Prefer not to say'].includes(updateData.gender)) {
        res.status(400).json({
          success: false,
          message: "Invalid gender value",
        });
        return;
      }

      // Validate date of birth if provided
      if (updateData.dateOfBirth) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(updateData.dateOfBirth)) {
          res.status(400).json({
            success: false,
            message: "Date of birth must be in YYYY-MM-DD format",
          });
          return;
        }
        
        const birthDate = new Date(updateData.dateOfBirth);
        if (isNaN(birthDate.getTime())) {
          res.status(400).json({
            success: false,
            message: "Invalid date of birth",
          });
          return;
        }
      }

      // Prepare update object with only allowed fields
      const updateFields: any = {
        updatedAt: new Date(),
      };

      // Add fields if they are provided in the request
      if (updateData.name !== undefined) {
        updateFields.name = updateData.name.trim();
      }
      if (updateData.mobileNumber !== undefined) {
        updateFields.mobileNumber = updateData.mobileNumber.trim();
      }
      if (updateData.gender !== undefined) {
        updateFields.gender = updateData.gender;
      }
      if (updateData.dateOfBirth !== undefined) {
        updateFields.dateOfBirth = updateData.dateOfBirth;
      }

      // Update user profile
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateFields,
        select: {
          id: true,
          email: true,
          name: true,
          dateOfBirth: true,
          gender: true,
          mobileNumber: true,
          verified: true,
          isNewUser: true,
          onboardingCompleted: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Calculate age from dateOfBirth if available
      let age: number | null = null;
      if (updatedUser.dateOfBirth) {
        const birthDate = new Date(updatedUser.dateOfBirth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }

      console.log(`✅ Profile updated for user: ${existingUser.email}`);

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            personalInfo: {
              name: updatedUser.name,
              dateOfBirth: updatedUser.dateOfBirth,
              age: age,
              gender: updatedUser.gender,
              mobileNumber: updatedUser.mobileNumber,
            },
            accountInfo: {
              verified: updatedUser.verified,
              isNewUser: updatedUser.isNewUser,
              onboardingCompleted: updatedUser.onboardingCompleted,
              lastLoginAt: updatedUser.lastLoginAt,
              createdAt: updatedUser.createdAt,
              updatedAt: updatedUser.updatedAt,
            },
          },
        },
      });
    } catch (error) {
      console.error("Update Profile Error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error. Please try again.",
      });
    }
  }
);


module.exports = router;
