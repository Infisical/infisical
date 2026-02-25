/**
 * Initialize Agent Arbiter with demo policies
 * Run: npm run init
 */

import "dotenv/config";

const INFISICAL_API_URL = process.env.INFISICAL_BASE_URL || "http://localhost:8080";
const INFISICAL_PROJECT_ID = process.env.INFISICAL_PROJECT_ID || "";
const INFISICAL_TOKEN = process.env.INFISICAL_MACHINE_IDENTITY_TOKEN || "";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

async function init(): Promise<void> {
  console.log(
    `\n${COLORS.bright}${COLORS.cyan}Infisical Agent Arbiter - Initialize${COLORS.reset}\n`,
  );

  console.log(`${COLORS.dim}API URL:    ${INFISICAL_API_URL}${COLORS.reset}`);
  console.log(
    `${COLORS.dim}Project ID: ${INFISICAL_PROJECT_ID}${COLORS.reset}`,
  );
  console.log("");

  const seedUrl = `${INFISICAL_API_URL}/api/v1/agentgate/seed-demo?projectId=${encodeURIComponent(INFISICAL_PROJECT_ID)}`;

  console.log("Seeding agent policies...");

  try {
    const response = await fetch(seedUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INFISICAL_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `${response.status} ${response.statusText}: ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      success: boolean;
      agentsCreated: string[];
    };

    if (result.success) {
      console.log(
        `\n${COLORS.green}✅ Initialization complete${COLORS.reset}\n`,
      );
      console.log("Agents configured:");
      for (const agent of result.agentsCreated) {
        console.log(`  ${COLORS.cyan}•${COLORS.reset} ${agent}`);
      }
      console.log("");
      console.log(
        `${COLORS.dim}Run 'npm run all-agents' to start the agents${COLORS.reset}`,
      );
      console.log(
        `${COLORS.dim}Run 'npm run demo' to execute the demo scenario${COLORS.reset}`,
      );
      console.log("");
    } else {
      throw new Error("Seed returned success: false");
    }
  } catch (error) {
    console.log(`\n${COLORS.red}❌ Initialization failed${COLORS.reset}\n`);

    if (error instanceof Error) {
      if (
        error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED")
      ) {
        console.log(
          `Could not connect to Agent Arbiter at ${INFISICAL_API_URL}`,
        );
        console.log(
          `${COLORS.dim}Make sure the Infisical backend is running.${COLORS.reset}`,
        );
      } else {
        console.log(`Error: ${error.message}`);
      }
    }

    console.log("");
    process.exit(1);
  }
}

init().catch(console.error);
