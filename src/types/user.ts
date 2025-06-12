import { Request } from 'express';
interface User {
  id: number;
  email: string;
  verified: boolean;
  isNewUser: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export interface OnboardingRequest {
  basicInfo: {
    name: string;
    dateOfBirth: string;
    gender: string;
  };
  physicalInfo: {
    height: number;
    heightUnit: string;
    weight: number;
  };
  healthInfo: {
    medicalConditions: string[];
    activityLevel: string;
  };
  dietaryInfo: {
    dietaryPreference: string;
    likedFoods: string[];
    dislikedFoods: string[];
  };
  fitnessInfo: {
    fitnessGoal: string;
  };
  onboardingCompleted: boolean;
}

export interface OnboardingResponse {
  success: boolean;
  message: string;
  data?: {
    user: {
      id: string;
      email: string;
      onboardingCompleted: boolean;
      profile: any;
    };
  };
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}
