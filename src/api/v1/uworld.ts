import { Response, Router, Request } from "express";
import { console } from "inspector";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import axios from "axios";
const router = Router();
export interface UWorldTopic {
  topic: string;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
}
interface UWorldData {
  topics: UWorldTopic[];
  overallStats: UWorldOverallStats;
}

export interface UWorldOverallStats {
  totalQuestions: number;
  totalCorrect: number;
  overallAccuracy: number;
}

export class JSONParser {
  /**
   * Extracts and parses JSON from AI response that may contain markdown code blocks
   * Handles formats like:
   * - ```json\n{...}\n```
   */
  static extractJSON(text: string): any {
    // Remove any leading/trailing whitespace
    const cleanText = text.trim();

    // Try to extract JSON from markdown code blocks
    const codeBlockPatterns = [
      /```json\s*\n([\s\S]*?)\n\s*```/i, // ```json ... ```
    ];

    for (const pattern of codeBlockPatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1].trim());
        } catch (error) {
          console.warn("Failed to parse extracted JSON:", match[1]);
          continue;
        }
      }
    }

    // Try parsing the entire text as JSON (fallback)
    try {
      return JSON.parse(cleanText);
    } catch (error) {
      // If all else fails, try to find JSON-like content
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error("Failed to parse JSON from text:", cleanText);
          throw new Error(
            `Invalid JSON response: ${cleanText.substring(0, 200)}...`
          );
        }
      }

      throw new Error(
        `No valid JSON found in response: ${cleanText.substring(0, 200)}...`
      );
    }
  }

  /**
   * Validates that the parsed JSON matches expected UWorld data structure
   */
  static validateUWorldJSON(data: any): data is UWorldData {
    return (
      data &&
      typeof data === "object" &&
      Array.isArray(data.topics) &&
      data.topics.every(
        (topic: any) =>
          topic &&
          typeof topic.topic === "string" &&
          typeof topic.totalAttempts === "number" &&
          typeof topic.correctAttempts === "number" &&
          typeof topic.accuracy === "number"
      ) &&
      data.overallStats &&
      typeof data.overallStats.totalQuestions === "number" &&
      typeof data.overallStats.totalCorrect === "number" &&
      typeof data.overallStats.overallAccuracy === "number"
    );
  }
}

// Complete Onboarding Route
router.post("/llm", async (req: Request, res: Response) => {
  try {
    const { presignedUrl, prompt, webhookUrl, docId } = req.body;
    console.log("new request", webhookUrl, docId);

    // Validate required fields
    if (!presignedUrl) {
      res.status(400).json({
        success: false,
        message: "Presigned URL is required",
      });
      return;
    }

    if (!prompt) {
      res.status(400).json({
        success: false,
        message: "Prompt is required",
      });
      return;
    }

    // Execute LLM call
    const { text } = await generateText({
      model: openai("gpt-5-mini-2025-08-07"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "file",
              data: presignedUrl,
              mediaType: "application/pdf",
            },
          ],
        },
      ],
    });

    console.log("Raw AI response:", text);

    // Parse JSON with robust handling of markdown code blocks
    let parsedData: UWorldData;
    try {
      parsedData = JSONParser.extractJSON(text);
      await callWebhook(webhookUrl, true, JSON.stringify(parsedData), docId);
    } catch (jsonError) {
      console.error("Invalid JSON response from AI:", text);
      await callWebhook(webhookUrl, false, JSON.stringify({}), docId);

      throw new Error("AI returned invalid JSON response");
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: "LLM processing completed successfully",
      data: {
        response: text,
      },
    });
  } catch (error) {
    console.error("Complete Onboarding Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
    });
  }
});

async function callWebhook(
  webhookUrl: string,
  success: boolean,
  data: string,
  docId: string
) {
  try {
    const res = await axios.post(webhookUrl, {
      docId: docId,
      data: data,
      success: success,
    });
  } catch (error) {}
}

module.exports = router;
