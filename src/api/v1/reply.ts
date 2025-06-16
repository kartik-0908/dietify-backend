import { Response, Router } from "express";
import { authenticateToken } from "../../lib/auth";
import { graph } from "../../memory_agent/graph";
import { prisma } from "../../lib/prisma";
import { AuthenticatedRequest } from "../../types/user";
import {
  AIMessageChunk,
  BaseMessageChunk,
  HumanMessage,
  isAIMessageChunk,
} from "@langchain/core/messages";
const router = Router();

// Complete Onboarding Route
router.post(
  "/",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    console.log("Received Reply Request:", req.body);
    const msg = req.body.message;
    const threadId = req.body.threadId;
    const userId = req.user?.userId;
    const image = req.body.image;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!threadId) {
      res.status(400).json({
        success: false,
        message: "Thread ID is required",
      });
      return;
    }

    const chat = await prisma.chat.findUnique({
      where: { id: threadId, userId: userId },
    });
    if (!chat) {
      await prisma.chat.create({
        data: {
          id: threadId,
          userId: userId,
          title: "New Chat",
          createdAt: new Date(),
        },
      });
    }

    console.log("Received message:", msg);

    if (!msg) {
      res.status(400).send("Message query parameter is required");
      return;
    }

    // Set headers for Server-Sent Events (SSE)
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    const config = {
      configurable: {
        thread_id: threadId,
        userId: userId,
      },
    };

    let inputMessage = new HumanMessage(msg);
    if (image) {
      inputMessage = new HumanMessage({
        content: [
          {
            type: "text",
            text: msg,
          },
          {
            type: "image_url",
            image_url: {
              url: image,
            },
          },
        ],
      });
    }

    try {
      // Stream the chunks to the client
      const stream = await graph.stream(
        { messages: [inputMessage] },
        { ...config, streamMode: "messages" }
      );
      for await (const [message, _metadata] of stream) {
        if (
          isAIMessageChunk(message as BaseMessageChunk) &&
          (message as AIMessageChunk).tool_call_chunks?.length
        ) {
          console.log(
            `${message.getType()} MESSAGE TOOL CALL CHUNK: ${JSON.stringify(message)}`
          );
        } else if (isAIMessageChunk(message as BaseMessageChunk)) {
          const eventData = {
            id: Date.now(),
            type: "message",
            content: message.content,
            timestamp: new Date().toISOString(),
          };
          console.log(
            `${message.getType()} MESSAGE CONTENT: ${message.content}`
          );
          console.log("Sending event data:", eventData);

          res.write(`data: ${JSON.stringify(eventData)}\n\n`);
        }
        // const lastMessage = chunk.messages[chunk.messages.length - 1];
        // console.log(lastMessage);

        // Send the chunk as SSE data
        // if (lastMessage.content !== msg) {
        //   const eventData = {
        //     id: Date.now(),
        //     type: "message",
        //     content: lastMessage.content,
        //     timestamp: new Date().toISOString(),
        //   };
        //   console.log("Sending event data:", eventData);

        //   res.write(`data: ${JSON.stringify(eventData)}\n\n`);
        // }
      }

      // Send completion event
      res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error streaming response:", error);

      // Send error event
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "An error occurred while processing your request",
        })}\n\n`
      );
      res.end();
    }
  }
);

module.exports = router;
