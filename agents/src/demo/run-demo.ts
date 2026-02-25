/**
 * Agent Arbiter Demo - Run Demo Scenario
 *
 * This script sends a real customer ticket to the Triage Agent,
 * which triggers the full agent flow with actual policy checks
 * against the Infisical Agent Arbiter backend.
 *
 * Prerequisites:
 *   1. npm run init    (seed policies in Agent Arbiter)
 *   2. npm run all-agents  (start the agents)
 *   3. npm run demo    (run this script)
 */

import { v4 as uuidv4 } from "uuid";
import { Client, ClientFactory } from "@a2a-js/sdk/client";
import { DEMO_TICKET, AGENT_PORTS } from "../shared/index.js";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function printBanner(): void {
  console.log("\n" + "═".repeat(70));
  console.log(`${COLORS.bright}${COLORS.cyan}`);
  console.log(
    "    ___                    __     ___       __    _ __           ",
  );
  console.log(
    "   / _ |___ ____ ___  ____/ /_   / _ | ____/ /   (_) /____ ____ ",
  );
  console.log(
    "  / __ / _ `/ -_) _ \\/ __/ __/  / __ |/ __/ _ \\ / / __/ -_) __/ ",
  );
  console.log(
    " /_/ |_\\_, /\\__/_//_/\\__/\\__/  /_/ |_/_/ /_.__/_/_/\\__/\\__/_/    ",
  );
  console.log(
    "      /___/                                                      ",
  );
  console.log(`${COLORS.reset}`);
  console.log("             Infisical Agent Arbiter Demo");
  console.log("        Autonomous Customer Support Agents");
  console.log("═".repeat(70) + "\n");
}

function printTicket(sessionId: string): void {
  console.log(`${COLORS.bright}📧 INCOMING CUSTOMER TICKET${COLORS.reset}`);
  console.log("─".repeat(50));
  console.log(`  Session ID: ${COLORS.cyan}${sessionId}${COLORS.reset}`);
  console.log(`  Ticket ID:  ${DEMO_TICKET.ticketId}`);
  console.log(`  Order ID:   ${DEMO_TICKET.orderId}`);
  console.log(
    `  Customer:   ${DEMO_TICKET.customerName} <${DEMO_TICKET.customerEmail}>`,
  );
  console.log(`  Loyalty:    ${DEMO_TICKET.loyaltyStatus || "standard"}`);
  console.log(`  Issue:`);
  console.log(`    "${DEMO_TICKET.issueDescription}"`);
  console.log("─".repeat(50) + "\n");
}

async function runDemo(): Promise<void> {
  printBanner();

  // Generate a session ID that will track all events across agents
  const sessionId = `session-${uuidv4().slice(0, 8)}`;

  console.log(`${COLORS.bright}🔗 CONNECTING TO TRIAGE AGENT${COLORS.reset}\n`);

  const factory = new ClientFactory();
  let triageClient: Client;

  try {
    triageClient = await factory.createFromUrl(
      `http://localhost:${AGENT_PORTS.triage}`,
    );
    console.log(
      `${COLORS.green}✅ Connected to Triage Agent at port ${AGENT_PORTS.triage}${COLORS.reset}\n`,
    );
  } catch (error) {
    console.log(
      `${COLORS.red}❌ Could not connect to Triage Agent${COLORS.reset}`,
    );
    console.log(
      `${COLORS.dim}Make sure to run 'npm run all-agents' first.${COLORS.reset}\n`,
    );
    process.exit(1);
  }

  printTicket(sessionId);

  console.log(
    `${COLORS.bright}🚀 SENDING TICKET TO TRIAGE AGENT${COLORS.reset}\n`,
  );
  console.log(
    `${COLORS.dim}Watch the agent terminal and Infisical dashboard for policy evaluations...${COLORS.reset}`,
  );
  console.log(
    `${COLORS.dim}Filter by sessionId: ${COLORS.cyan}${sessionId}${COLORS.reset}\n`,
  );
  console.log("─".repeat(70) + "\n");

  // Create ticket with sessionId attached
  const ticketWithSession = {
    ...DEMO_TICKET,
    sessionId,
  };

  try {
    const result = await triageClient.sendMessage({
      message: {
        kind: "message",
        messageId: uuidv4(),
        role: "user",
        parts: [
          {
            kind: "data",
            data: ticketWithSession as unknown as Record<string, unknown>,
          },
        ],
      },
    });

    // sendMessage returns Message | Task
    if (result.kind === "message") {
      console.log("\n" + "─".repeat(70));
      console.log(`\n${COLORS.bright}📋 MESSAGE RESPONSE${COLORS.reset}\n`);
      console.log(
        `Message ID: ${COLORS.cyan}${result.messageId}${COLORS.reset}`,
      );
      console.log(`Role: ${result.role}\n`);

      if (result.parts && result.parts.length > 0) {
        console.log(`${COLORS.bright}Content:${COLORS.reset}`);
        for (const part of result.parts) {
          if (part.kind === "text") {
            try {
              const parsed = JSON.parse(part.text);
              console.log(JSON.stringify(parsed, null, 2));
            } catch {
              console.log(`  ${part.text}`);
            }
          }
        }
      }

      console.log("\n" + "═".repeat(70));
      console.log(
        `${COLORS.bright}${COLORS.green}✅ DEMO COMPLETE${COLORS.reset}`,
      );
      console.log("═".repeat(70) + "\n");
      return;
    }

    const task = result;
    console.log(`${COLORS.cyan}Task created: ${task.id}${COLORS.reset}`);
    console.log(`${COLORS.dim}Status: ${task.status.state}${COLORS.reset}\n`);

    let finalTask = task;
    let pollCount = 0;
    const maxPolls = 60;

    while (
      finalTask.status.state === "working" ||
      finalTask.status.state === "submitted"
    ) {
      await sleep(1000);
      pollCount++;

      if (pollCount > maxPolls) {
        console.log(
          `${COLORS.yellow}⚠️  Task still running after ${maxPolls}s, stopping poll...${COLORS.reset}`,
        );
        break;
      }

      try {
        finalTask = await triageClient.getTask({ id: task.id });

        if (pollCount % 5 === 0) {
          console.log(
            `${COLORS.dim}... still processing (${pollCount}s)${COLORS.reset}`,
          );
        }
      } catch (e) {
        // Task may have completed
        break;
      }
    }

    console.log("\n" + "─".repeat(70));
    console.log(`\n${COLORS.bright}📋 TASK RESULT${COLORS.reset}\n`);
    console.log(
      `Status: ${COLORS.green}${finalTask.status.state}${COLORS.reset}`,
    );

    if (finalTask.status.message) {
      console.log(`\nFinal Message:`);
      for (const part of finalTask.status.message.parts) {
        if (part.kind === "text") {
          console.log(`  ${part.text}`);
        }
      }
    }

    if (finalTask.artifacts && finalTask.artifacts.length > 0) {
      console.log(`\n${COLORS.bright}Artifacts:${COLORS.reset}`);
      for (const artifact of finalTask.artifacts) {
        console.log(`  - ${artifact.name || "unnamed"}`);
        for (const part of artifact.parts) {
          if (part.kind === "text") {
            try {
              const parsed = JSON.parse(part.text);
              console.log(
                `    ${JSON.stringify(parsed, null, 2).split("\n").join("\n    ")}`,
              );
            } catch {
              console.log(`    ${part.text}`);
            }
          }
        }
      }
    }

    console.log("\n" + "═".repeat(70));
    console.log(
      `${COLORS.bright}${COLORS.green}✅ DEMO COMPLETE${COLORS.reset}`,
    );
    console.log(
      `${COLORS.dim}Check Infisical dashboard for full audit trail of policy evaluations.${COLORS.reset}`,
    );
    console.log(
      `${COLORS.dim}Filter by: ${COLORS.cyan}sessionId = ${sessionId}${COLORS.reset}`,
    );
    console.log("═".repeat(70) + "\n");
  } catch (error) {
    console.log(`${COLORS.red}❌ Error during demo:${COLORS.reset}`);
    console.error(error);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runDemo().catch(console.error);
