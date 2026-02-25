import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { Client, ClientFactory } from "@a2a-js/sdk/client";
import { Task } from "@a2a-js/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const TRIAGE_AGENT_URL = "http://localhost:4001";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Chat endpoint - sends message to Triage Agent and waits for response
app.post("/api/chat", async (req: Request, res: Response) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const sessionId = `session-${uuidv4().slice(0, 8)}`;
  const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

  // Parse the message to extract order info if mentioned
  const orderMatch = message.match(/(?:order\s*#?\s*|ORD-?)(\d+)/i);
  const orderId = orderMatch ? `ORD-${orderMatch[1]}` : extractOrderId(message);

  // Create a ticket from the chat message
  const ticket = {
    ticketId,
    sessionId,
    orderId: orderId || "UNKNOWN",
    customerEmail: "customer@avs.com",
    customerName: "AVS Customer",
    issueDescription: message,
    loyaltyStatus: "standard" as const,
    createdAt: new Date(),
    daysSinceCreated: 0,
  };

  console.log(`[AVS Chat] New message: "${message.substring(0, 50)}..."`);
  console.log(`[AVS Chat] Created ticket ${ticketId}, session ${sessionId}`);

  try {
    const factory = new ClientFactory();
    const triageClient: Client = await factory.createFromUrl(TRIAGE_AGENT_URL);

    console.log(`[AVS Chat] Connected to Triage Agent`);

    const result = await triageClient.sendMessage({
      message: {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [
          {
            kind: "data",
            data: ticket,
          },
        ],
      },
    });

    if (result.kind === "task") {
      let task = result;
      console.log(`[AVS Chat] Task created: ${task.id}`);

      // Poll until task completes
      const terminalStates = ["completed", "failed", "canceled"];
      const maxPolls = 120;
      let polls = 0;

      while (!terminalStates.includes(task.status.state) && polls < maxPolls) {
        await sleep(1000);
        polls++;

        try {
          task = await triageClient.getTask({ id: task.id });
        } catch {
          break;
        }
      }

      console.log(`[AVS Chat] Task ${task.status.state} after ${polls}s`);

      // Extract response from task
      const response = extractResponse(task);
      res.json({ response, sessionId, ticketId });
    } else {
      // Direct message response
      const response = extractMessageResponse(result);
      res.json({ response, sessionId, ticketId });
    }
  } catch (error) {
    console.error("[AVS Chat] Error:", error);
    res.json({
      response:
        "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

function extractOrderId(message: string): string | null {
  // Try to match common order ID patterns
  const patterns = [/ORD-(\d+)/i, /order\s*#?\s*(\d+)/i, /#(\d{4,})/];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return `ORD-${match[1]}`;
    }
  }

  // Check for known order IDs in the message
  if (message.includes("8891") || message.toLowerCase().includes("macbook")) {
    return "ORD-8891";
  }
  if (message.includes("1234") || message.toLowerCase().includes("iphone")) {
    return "ORD-1234";
  }

  return null;
}

function extractResponse(task: Task): string {
  // Try to extract a human-readable response from the task result

  // Check status message
  if (task.status.message?.parts) {
    for (const part of task.status.message.parts) {
      if (part.kind === "text") {
        try {
          const parsed = JSON.parse(part.text);
          return formatTaskResponse(parsed);
        } catch {
          return part.text;
        }
      }
    }
  }

  // Check artifacts for resolution info
  if (task.artifacts && task.artifacts.length > 0) {
    for (const artifact of task.artifacts) {
      for (const part of artifact.parts) {
        if (part.kind === "data") {
          const data = (part as { kind: "data"; data: Record<string, unknown> })
            .data;
          if (
            data.action === "ticket_routed_and_processed" ||
            data.action === "ticket_resolved"
          ) {
            return formatTaskResponse(data);
          }
        }
        if (part.kind === "text") {
          try {
            const parsed = JSON.parse(part.text);
            return formatTaskResponse(parsed);
          } catch {
            // Not JSON
          }
        }
      }
    }
  }

  // Default response based on status
  if (task.status.state === "completed") {
    return "I've processed your request. Our team has reviewed your issue and taken the appropriate actions. You should receive a confirmation email shortly with the details.";
  }

  return "I've received your request and our team is looking into it. You'll receive an update via email soon.";
}

function formatTaskResponse(data: Record<string, unknown>): string {
  const parts: string[] = [];

  // Check for LLM summary first
  if (data.llmSummary) {
    return data.llmSummary as string;
  }

  // Build response from resolution data
  if (
    data.action === "ticket_resolved" ||
    data.action === "ticket_routed_and_processed"
  ) {
    parts.push("Great news! I've resolved your issue.");

    const resolution = (data.resolution ||
      data.supportResponse?.artifacts?.[0]?.data?.[0]) as
      | Record<string, unknown>
      | undefined;

    if (resolution) {
      if (
        resolution.totalRefundIssued &&
        (resolution.totalRefundIssued as number) > 0
      ) {
        parts.push(
          `\n\n💰 **Refund issued:** $${(resolution.totalRefundIssued as number).toFixed(2)}`,
        );
      }

      if (resolution.reshipmentCreated) {
        const tracking =
          resolution.trackingNumber || "will be provided shortly";
        parts.push(
          `\n\n📦 **Reshipment created:** Tracking number ${tracking}`,
        );
      }

      if (
        resolution.actionsPerformed &&
        Array.isArray(resolution.actionsPerformed)
      ) {
        const actions = (resolution.actionsPerformed as string[])
          .filter((a) => a.startsWith("✅"))
          .map((a) => a.replace("✅ ", "• "))
          .slice(0, 5);

        if (actions.length > 0) {
          parts.push(`\n\n**Actions taken:**\n${actions.join("\n")}`);
        }
      }
    }

    parts.push("\n\nIs there anything else I can help you with?");
  }

  if (parts.length > 0) {
    return parts.join("");
  }

  // Fallback
  return "I've processed your request. You should receive a confirmation email shortly with all the details.";
}

function extractMessageResponse(message: {
  parts: Array<{ kind: string; text?: string }>;
}): string {
  for (const part of message.parts) {
    if (part.kind === "text" && part.text) {
      try {
        const parsed = JSON.parse(part.text);
        return formatTaskResponse(parsed);
      } catch {
        return part.text;
      }
    }
  }
  return "I've received your message and I'm processing it.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║     █████╗ ██╗   ██╗███████╗                                      ║
║    ██╔══██╗██║   ██║██╔════╝                                      ║
║    ███████║██║   ██║███████╗                                      ║
║    ██╔══██║╚██╗ ██╔╝╚════██║                                      ║
║    ██║  ██║ ╚████╔╝ ███████║                                      ║
║    ╚═╝  ╚═╝  ╚═══╝  ╚══════╝                                      ║
║                                                                   ║
║    Customer Support Chat                                          ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

🌐 Chat Portal:   http://localhost:${PORT}
🤖 Triage Agent:  ${TRIAGE_AGENT_URL}

Make sure to run 'npm run all-agents' in the agents directory first!
`);
});
