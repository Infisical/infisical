import { spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { logger } from "@app/lib/logger";

/** Version is pinned so a sandbox start never picks up a surprise release. */
const GH_VERSION = "2.63.2";

const run = (command: string, args: string[], cwd: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code}): ${stderr.slice(0, 200)}`))
    );
  });

/**
 * Drops the GitHub CLI into the sandbox's own bin/. It is a single static binary, so the install is
 * per sandbox and needs no package manager or root.
 */
export const installGithubCli = async (rootDir: string) => {
  const binDir = join(rootDir, "bin");
  await mkdir(binDir, { recursive: true });

  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const name = `gh_${GH_VERSION}_linux_${arch}`;
  const url = `https://github.com/cli/cli/releases/download/v${GH_VERSION}/${name}.tar.gz`;

  // Every step runs from rootDir: the tarball lands there, so extracting from bin/ could not find it.
  await run("curl", ["-fsSL", "-o", "gh.tar.gz", url], rootDir);
  await run("tar", ["-xzf", "gh.tar.gz", "-C", "bin", `${name}/bin/gh`, "--strip-components=2"], rootDir);
  await run("rm", ["-f", "gh.tar.gz"], rootDir);
  await chmod(join(binDir, "gh"), 0o755);

  logger.info(`Installed gh into sandbox bin [version=${GH_VERSION}]`);
};

/** Writes the proxy's CA where the sandbox's HTTP clients can be pointed at it. */
export const writeSandboxCaCertificate = async (rootDir: string, certificatePem: string) => {
  const path = join(rootDir, "infisical-proxy-ca.crt");
  await writeFile(path, certificatePem, "utf8");
  return path;
};
