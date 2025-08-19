import { Response, Router, Request } from "express";
import { console } from "inspector";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import axios from "axios";
import { PDFDocument } from 'pdf-lib';

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

interface SplitPdfResult {
  pageNumber: number;
  buffer: Buffer;
  fileName: string;
}

interface PageProcessingResult {
  pageNumber: number;
  text: string;
  fileName: string;
  success: boolean;
  error?: string;
  parsedData?: UWorldData;
}

export class JSONParser {
  /**
   * Extracts and parses JSON from AI response that may contain markdown code blocks
   */
  static extractJSON(text: string): any {
    const cleanText = text.trim();

    const codeBlockPatterns = [
      /```json\s*\n([\s\S]*?)\n\s*```/i,
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

    try {
      return JSON.parse(cleanText);
    } catch (error) {
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

  /**
   * Combines multiple UWorldData objects from different pages
   */
  static combineUWorldData(pageResults: PageProcessingResult[]): UWorldData {
    const topicsMap = new Map<string, UWorldTopic>();
    let totalQuestions = 0;
    let totalCorrect = 0;

    // Process each page's data
    pageResults.forEach(result => {
      if (result.success && result.parsedData) {
        const data = result.parsedData;

        // Combine topics
        data.topics.forEach(topic => {
          if (topicsMap.has(topic.topic)) {
            const existing = topicsMap.get(topic.topic)!;
            existing.totalAttempts += topic.totalAttempts;
            existing.correctAttempts += topic.correctAttempts;
            existing.accuracy = existing.totalAttempts > 0 
              ? (existing.correctAttempts / existing.totalAttempts) * 100 
              : 0;
          } else {
            topicsMap.set(topic.topic, { ...topic });
          }
        });

        // Add to overall stats
        totalQuestions += data.overallStats.totalQuestions;
        totalCorrect += data.overallStats.totalCorrect;
      }
    });

    // Calculate overall accuracy
    const overallAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;

    return {
      topics: Array.from(topicsMap.values()),
      overallStats: {
        totalQuestions,
        totalCorrect,
        overallAccuracy
      }
    };
  }
}

/**
 * Downloads a PDF from an S3 URL and splits it into individual pages
 */
async function splitPdfFromS3Url(s3Url: string): Promise<SplitPdfResult[]> {
  try {
    const response = await fetch(s3Url);
    
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }

    const pdfArrayBuffer = await response.arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const numberOfPages = pdfDoc.getPageCount();
    
    const results: SplitPdfResult[] = [];

    for (let i = 0; i < numberOfPages; i++) {
      const subDocument = await PDFDocument.create();
      const [copiedPage] = await subDocument.copyPages(pdfDoc, [i]);
      subDocument.addPage(copiedPage);
      
      const pdfBytes = await subDocument.save();
      
      results.push({
        pageNumber: i + 1,
        buffer: Buffer.from(pdfBytes),
        fileName: `page-${i + 1}.pdf`
      });
    }

    return results;
  } catch (error) {
    throw new Error(`Error splitting PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Processes PDF page buffers in parallel using OpenAI GPT
 */
async function processPdfPagesInParallel(
  pageBuffers: SplitPdfResult[],
  prompt: string,
  options?: {
    maxConcurrency?: number;
    model?: string;
  }
): Promise<PageProcessingResult[]> {
  const { maxConcurrency = 3, model = "gpt-4o-mini" } = options || {};

  async function processPage(pageData: SplitPdfResult): Promise<PageProcessingResult> {
    try {
      console.log(`Processing page ${pageData.pageNumber}...`);
      
      const base64Data = pageData.buffer.toString('base64');
      const dataUri = `data:application/pdf;base64,${base64Data}`;

      const { text } = await generateText({
        model: openai(model),
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
                data: dataUri,
                mediaType: "application/pdf",
              },
            ],
          },
        ],
      });

      // Try to parse the JSON response
      let parsedData: UWorldData | undefined;
      try {
        const extracted = JSONParser.extractJSON(text);
        if (JSONParser.validateUWorldJSON(extracted)) {
          parsedData = extracted;
        }
      } catch (parseError) {
        console.warn(`Failed to parse JSON for page ${pageData.pageNumber}:`, parseError);
      }

      return {
        pageNumber: pageData.pageNumber,
        text,
        fileName: pageData.fileName,
        success: true,
        parsedData
      };
    } catch (error) {
      console.error(`Error processing page ${pageData.pageNumber}:`, error);
      return {
        pageNumber: pageData.pageNumber,
        text: "",
        fileName: pageData.fileName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  const results: PageProcessingResult[] = [];
  
  // Process pages in batches with controlled concurrency
  for (let i = 0; i < pageBuffers.length; i += maxConcurrency) {
    const batch = pageBuffers.slice(i, i + maxConcurrency);
    const batchPromises = batch.map(processPage);
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
    
    console.log(`Processed ${Math.min(i + maxConcurrency, pageBuffers.length)} of ${pageBuffers.length} pages`);
  }

  return results.sort((a, b) => a.pageNumber - b.pageNumber);
}

// Updated LLM Route with PDF splitting and parallel processing
router.post("/llm", async (req: Request, res: Response) => {
  try {
    const { presignedUrl, prompt, webhookUrl, docId } = req.body;
    console.log("New request received:", { webhookUrl, docId });

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

    console.log('Starting PDF processing workflow...');

    // Step 1: Split PDF into pages
    console.log('Splitting PDF into pages...');
    const pageBuffers = await splitPdfFromS3Url(presignedUrl);
    console.log(`PDF split into ${pageBuffers.length} pages`);

    // Step 2: Process pages in parallel
    console.log('Processing pages with LLM...');
    const pageResults = await processPdfPagesInParallel(
      pageBuffers, 
      prompt,
      {
        maxConcurrency: 5, // Adjust based on rate limits
        model: "gpt-5-mini-2025-08-07" // Use a more reliable model
      }
    );

    console.log('LLM processing completed for all pages');

    // Step 3: Combine results
    const successfulPages = pageResults.filter(r => r.success && r.parsedData);
    const failedPages = pageResults.filter(r => !r.success || !r.parsedData);

    console.log(`Successfully processed: ${successfulPages.length} pages`);
    console.log(`Failed/No data: ${failedPages.length} pages`);

    // Log failures for debugging
    failedPages.forEach(page => {
      console.error(`Page ${page.pageNumber} issue: ${page.error || 'No valid data extracted'}`);
    });

    let combinedData: UWorldData;
    let webhookSuccess = true;

    if (successfulPages.length > 0) {
      // Step 4: Combine all valid JSON responses
      combinedData = JSONParser.combineUWorldData(pageResults);
      console.log('Data combined successfully:', {
        totalTopics: combinedData.topics.length,
        totalQuestions: combinedData.overallStats.totalQuestions,
        overallAccuracy: combinedData.overallStats.overallAccuracy
      });
    } else {
      // No successful pages
      console.error('No pages were successfully processed');
      combinedData = {
        topics: [],
        overallStats: {
          totalQuestions: 0,
          totalCorrect: 0,
          overallAccuracy: 0
        }
      };
      webhookSuccess = false;
    }

    // Step 5: Call webhook with combined results
    if (webhookUrl) {
      await callWebhook(webhookUrl, webhookSuccess, JSON.stringify(combinedData), docId);
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: "LLM processing completed successfully",
      data: {
        totalPages: pageBuffers.length,
        successfulPages: successfulPages.length,
        failedPages: failedPages.length,
        combinedData
      },
    });

  } catch (error) {
    console.error("PDF Processing Error:", error);

    // Call webhook with failure status
    if (req.body.webhookUrl) {
      await callWebhook(req.body.webhookUrl, false, JSON.stringify({}), req.body.docId);
    }

    res.status(500).json({
      success: false,
      message: "Internal server error. Please try again.",
      error: error instanceof Error ? error.message : 'Unknown error'
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
    console.log('Webhook called successfully');
  } catch (error) {
    console.error('Webhook call failed:', error);
  }
}

module.exports = router;