import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { Client, ClientFactory } from "@a2a-js/sdk/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const TRIAGE_AGENT_URL = "http://localhost:4001";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Mock order data (matches frontend)
const MOCK_ORDERS: Record<string, {
  orderId: string;
  customerEmail: string;
  customerName: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  total: number;
  status: string;
  shippedItem?: string;
  expectedItem?: string;
  loyaltyStatus: "standard" | "silver" | "gold" | "platinum";
}> = {
  "ORD-8891": {
    orderId: "ORD-8891",
    customerEmail: "alice.johnson@email.com",
    customerName: "Alice Johnson",
    items: [{ name: 'MacBook Pro 16"', price: 2499, quantity: 1 }],
    total: 2499,
    status: "delivered",
    shippedItem: "Sony WH-1000XM5 Headphones",
    expectedItem: 'MacBook Pro 16"',
    loyaltyStatus: "standard",
  },
  "ORD-1234": {
    orderId: "ORD-1234",
    customerEmail: "bob.smith@email.com",
    customerName: "Bob Smith",
    items: [
      { name: "iPhone 15 Pro", price: 1199, quantity: 1 },
      { name: "AirPods Pro", price: 249, quantity: 1 },
    ],
    total: 1448,
    status: "shipped",
    loyaltyStatus: "gold",
  },
  "ORD-5555": {
    orderId: "ORD-5555",
    customerEmail: "vip.customer@email.com",
    customerName: "Victoria Important",
    items: [
      { name: "Apple Watch Ultra 2", price: 799, quantity: 1 },
      { name: "Apple Watch Band", price: 49, quantity: 2 },
    ],
    total: 897,
    status: "delivered",
    loyaltyStatus: "platinum",
  },
};

// Support request endpoint
app.post("/api/support", async (req: Request, res: Response) => {
  const { orderId, issueType, issueDescription } = req.body;

  if (!orderId || !issueType || !issueDescription) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const order = MOCK_ORDERS[orderId];
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const sessionId = `session-${uuidv4().slice(0, 8)}`;
  const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

  // Calculate days since order (for demo, use a small number)
  const daysSinceCreated = issueType === "billing" ? 8 : 0;

  // Create ticket from support request
  const ticket = {
    ticketId,
    sessionId,
    orderId,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    issueDescription,
    loyaltyStatus: order.loyaltyStatus,
    createdAt: new Date(),
    daysSinceCreated,
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`[AVS] New support request`);
  console.log(`  Ticket: ${ticketId}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Order: ${orderId}`);
  console.log(`  Type: ${issueType}`);
  console.log(`  Customer: ${order.customerName} (${order.loyaltyStatus})`);
  console.log(`  Issue: ${issueDescription.substring(0, 60)}...`);
  console.log(`${"=".repeat(60)}\n`);

  // Respond immediately to the user
  res.json({
    success: true,
    response: `Thank you for contacting us. We've received your request and our team is looking into it.<br><br>You'll receive an update at <strong>${order.customerEmail}</strong> shortly.`,
    sessionId,
    ticketId,
  });

  // Process the ticket in the background (fire and forget)
  processTicketAsync(ticket);
});

// Background ticket processing
async function processTicketAsync(ticket: Record<string, unknown>): Promise<void> {
  try {
    const factory = new ClientFactory();
    const triageClient: Client = await factory.createFromUrl(TRIAGE_AGENT_URL);

    console.log(`[AVS] Connected to Triage Agent, sending ticket ${ticket.ticketId}...`);

    const result = await triageClient.sendMessage({
      message: {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [{ kind: "data", data: ticket }],
      },
    });

    if (result.kind === "task") {
      console.log(`[AVS] Task created: ${result.id} - processing in background`);
    }
  } catch (error) {
    console.error("[AVS] Background processing error:", error);
  }
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
║    E-Commerce Platform                                            ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

🌐 Store:         http://localhost:${PORT}
🤖 Triage Agent:  ${TRIAGE_AGENT_URL}

Make sure to run 'npm run all-agents' in the agents directory first!
`);
});
