import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

/**
 * Opens a PAM database proxy per granted account using `infisical pam db access`.
 *
 * The CLI runs on the API host, not inside the sandbox, so the identity token and the database
 * credential both stay outside the sandbox: the sandbox only ever learns a localhost port. When the
 * sandbox becomes a container with its own network namespace, this moves inside it and authenticates
 * with a placeholder token that the egress proxy swaps, which is the same shape one level down.
 */

const PROXY_READY_TIMEOUT_MS = 20_000;

export type TPamTarget = {
  accountId: string;
  accountName: string;
  resourceName: string;
  projectId: string;
  resourceType: string;
};

export type TPamProxy = {
  accountId: string;
  accountName: string;
  resourceName: string;
  port: number;
};

type TSandboxPamState = {
  proxies: TPamProxy[];
  processes: ReturnType<typeof spawn>[];
};

const states = new Map<string, TSandboxPamState>();

const findFreePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

const resolveApiUrl = () => {
  const appCfg = getConfig();
  return appCfg.SANDBOX_INFISICAL_API_URL || `http://127.0.0.1:${appCfg.PORT}/api`;
};

/** Universal Auth login, printing the access token the proxy command then runs with. */
const mintAccessToken = async (clientId: string, clientSecret: string): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(
      "infisical",
      [
        "login",
        "--method=universal-auth",
        `--client-id=${clientId}`,
        `--client-secret=${clientSecret}`,
        "--plain",
        "--silent",
        `--domain=${resolveApiUrl()}`
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });

    child.on("close", (code) => {
      const token = stdout.trim().split("\n").pop()?.trim();
      if (code === 0 && token) resolve(token);
      else reject(new Error(`infisical login failed (exit ${code}): ${stderr.slice(0, 300)}`));
    });
    child.on("error", reject);
  });

const waitForPort = (port: number) =>
  new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + PROXY_READY_TIMEOUT_MS;

    const attempt = () => {
      const socket = createServer();
      // The port is taken once the proxy is listening, so a failed bind means it is ready.
      socket.once("error", () => resolve());
      socket.listen(port, "127.0.0.1", () => {
        socket.close(() => {
          if (Date.now() > deadline) reject(new Error("PAM proxy did not start in time"));
          else setTimeout(attempt, 400);
        });
      });
    };

    attempt();
  });

export const startPamProxies = async (
  sandboxId: string,
  targets: TPamTarget[],
  identity: { clientId: string; clientSecret: string }
): Promise<TPamProxy[]> => {
  if (!targets.length) return [];

  const token = await mintAccessToken(identity.clientId, identity.clientSecret);
  const apiUrl = resolveApiUrl();
  const state: TSandboxPamState = { proxies: [], processes: [] };

  for (const target of targets) {
    // eslint-disable-next-line no-await-in-loop -- ports are assigned one at a time on purpose
    const port = await findFreePort();

    const child = spawn(
      "infisical",
      [
        "pam",
        "db",
        "access",
        `--project-id=${target.projectId}`,
        `--resource=${target.resourceName}`,
        `--account=${target.accountName}`,
        `--port=${port}`,
        "--reason=Infisical Sandbox agent session",
        "--silent",
        `--domain=${apiUrl}`
      ],
      { env: { ...process.env, INFISICAL_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"], detached: true }
    );

    child.stderr.on("data", (c: Buffer) => {
      logger.warn(`PAM proxy stderr [sandboxId=${sandboxId}] [account=${target.accountName}]: ${c.toString("utf8")}`);
    });

    state.processes.push(child);
    state.proxies.push({
      accountId: target.accountId,
      accountName: target.accountName,
      resourceName: target.resourceName,
      port
    });

    // eslint-disable-next-line no-await-in-loop
    await waitForPort(port).catch((error: Error) => {
      logger.error(error, `PAM proxy failed to open [sandboxId=${sandboxId}] [account=${target.accountName}]`);
    });
  }

  states.set(sandboxId, state);
  logger.info(`PAM proxies opened [sandboxId=${sandboxId}] [count=${state.proxies.length}]`);

  return state.proxies;
};

export const stopPamProxies = (sandboxId: string) => {
  const state = states.get(sandboxId);
  if (!state) return;

  states.delete(sandboxId);
  state.processes.forEach((child) => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  });
};

export const getPamProxies = (sandboxId: string) => states.get(sandboxId)?.proxies ?? [];
