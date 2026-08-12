import { spawn } from "node:child_process";
import path from "node:path";

import { GUIDERAILS_ROOT } from "../paths.js";

const COMPOSE_FILE = path.join(GUIDERAILS_ROOT, "docker-compose.yml");

export type ComposeResult = { code: number; stdout: string; stderr: string };

const runCompose = (args: string[], stream: boolean): Promise<ComposeResult> =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
      cwd: GUIDERAILS_ROOT,
      env: process.env,
      stdio: stream ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Could not run "docker compose". Is Docker installed and running? (${error.message})`
        )
      );
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });

export const composeUp = async (): Promise<void> => {
  // `--wait` blocks on the healthchecks declared in the compose file, so returning from here
  // means the API answered /api/status rather than merely that a container started.
  const result = await runCompose(["up", "-d", "--wait", "--wait-timeout", "300"], true);
  if (result.code !== 0) {
    throw new Error(
      `docker compose up failed with exit code ${result.code}. ` +
        `Run \`guiderails env logs\` to see why the backend did not become healthy.`
    );
  }
};

export const composeDown = async (removeVolumes: boolean): Promise<void> => {
  const args = ["down", "--remove-orphans"];
  if (removeVolumes) args.push("--volumes");
  await runCompose(args, true);
};

export const composeLogs = async (tail: number): Promise<void> => {
  await runCompose(["logs", "--tail", String(tail), "backend"], true);
};

export const composePs = async (): Promise<string> => {
  const result = await runCompose(["ps", "--format", "json"], false);
  return result.stdout;
};

export { COMPOSE_FILE };
