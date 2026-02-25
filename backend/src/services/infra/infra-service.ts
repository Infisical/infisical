import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { logger } from "@app/lib/logger";

import { InfraRunStatus, TInfraRunDTO } from "./infra-types";

export const infraServiceFactory = () => {
  const run = async (
    dto: TInfraRunDTO,
    onData: (chunk: string) => void,
    onComplete: (status: InfraRunStatus) => void
  ) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "infra-"));

    try {
      // Write the user's HCL to main.tf
      await fs.writeFile(path.join(tmpDir, "main.tf"), dto.hcl, "utf-8");

      onData(`[infra] Writing configuration to ${tmpDir}/main.tf\n`);

      const binary = await findTofu();
      onData(`[infra] Using binary: ${binary}\n`);

      // Run init first
      onData(`[infra] Running ${binary} init...\n`);
      await runCommand(binary, ["init", "-no-color"], tmpDir, onData);

      // Run the requested command
      const args =
        dto.mode === "plan"
          ? ["plan", "-no-color"]
          : ["apply", "-auto-approve", "-no-color"];

      onData(`\n[infra] Running ${binary} ${args.join(" ")}...\n`);
      await runCommand(binary, args, tmpDir, onData);

      onComplete(InfraRunStatus.Success);
    } catch (err) {
      logger.error(err, "Infra run failed");
      onData(`\n[infra] Error: ${err instanceof Error ? err.message : String(err)}\n`);
      onComplete(InfraRunStatus.Failed);
    } finally {
      // Cleanup temp directory
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  return { run };
};

export type TInfraService = ReturnType<typeof infraServiceFactory>;

async function findTofu(): Promise<string> {
  const searchPaths = [
    "tofu",
    "/usr/bin/tofu",
    "/usr/local/bin/tofu",
    "/opt/homebrew/bin/tofu",
    "/snap/bin/tofu"
  ];

  for (const fullPath of searchPaths) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(fullPath, ["version"], { stdio: "ignore" });
        proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("not found"))));
        proc.on("error", reject);
      });
      return fullPath;
    } catch {
      // Try next
    }
  }
  throw new Error("OpenTofu (tofu) binary not found. Install it: https://opentofu.org/docs/intro/install/");
}

function runCommand(
  binary: string,
  args: string[],
  cwd: string,
  onData: (chunk: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    proc.stdout.on("data", (data: Buffer) => {
      onData(data.toString());
    });

    proc.stderr.on("data", (data: Buffer) => {
      onData(data.toString());
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${binary} exited with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}
