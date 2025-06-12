import { Response, Router } from "express";
import {
  AuthenticatedRequest,
  OnboardingRequest,
  OnboardingResponse,
} from "../../types/user";
import { authenticateToken } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
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

module.exports = router;
