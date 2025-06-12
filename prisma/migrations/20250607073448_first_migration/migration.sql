-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('text', 'code', 'image', 'sheet');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('preference', 'goal', 'fact', 'routine', 'general');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('manual', 'app', 'device', 'barcode', 'conversation', 'profile', 'activity', 'inference');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(64) NOT NULL,
    "firstName" VARCHAR(32),
    "lastName" VARCHAR(32),
    "dateOfBirth" VARCHAR(16),
    "weight" VARCHAR(8),
    "height" VARCHAR(8),
    "mobileNumber" VARCHAR(16),
    "dietaryPreference" VARCHAR(64),
    "medicalConditions" JSONB,
    "foodLiking" JSONB,
    "foodDisliking" JSONB,
    "fitnessGoal" VARCHAR(32),
    "activityLevel" VARCHAR(32),
    "gender" VARCHAR(16),
    "prompt" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'private',

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "attachments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "chatId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "isUpvoted" BOOLEAN NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("chatId","messageId")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterIntakeLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" DECIMAL(6,2) NOT NULL,
    "unit" VARCHAR(8) NOT NULL DEFAULT 'ml',
    "consumedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "source" VARCHAR(32) DEFAULT 'manual',

    CONSTRAINT "WaterIntakeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaloriesIntakeLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "calories" DECIMAL(8,2) NOT NULL,
    "foodItem" VARCHAR(128) NOT NULL,
    "quantity" DECIMAL(6,2),
    "unit" VARCHAR(32),
    "mealType" VARCHAR(32) NOT NULL DEFAULT 'snack',
    "carbs" DECIMAL(6,2),
    "proteins" DECIMAL(6,2),
    "fats" DECIMAL(6,2),
    "consumedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "source" VARCHAR(32) DEFAULT 'manual',

    CONSTRAINT "CaloriesIntakeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "memoryContent" TEXT NOT NULL,
    "memoryType" VARCHAR(32) NOT NULL DEFAULT 'general',
    "importanceScore" INTEGER NOT NULL DEFAULT 5,
    "tags" JSONB,
    "source" VARCHAR(32) NOT NULL DEFAULT 'conversation',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stream" ADD CONSTRAINT "Stream_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterIntakeLog" ADD CONSTRAINT "WaterIntakeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaloriesIntakeLog" ADD CONSTRAINT "CaloriesIntakeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
