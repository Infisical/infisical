import { spawn } from "node:child_process";

import { logger } from "@app/lib/logger";

/**
 * Docker is what makes a sandbox a boundary rather than a directory. Each sandbox is a container of
 * its own on an `internal` network, so the workload cannot see the API host's filesystem, its
 * processes, or anything on the compose network. The only route off that network is the sandbox's
 * egress proxy, which is what makes the brokering claim true instead of advisory.
 *
 * The API drives the host's Docker daemon through the mounted socket, which is why the runtime is
 * still refused outside development.
 */

const IMAGE = "infisical-sandbox:1";
const NETWORK = "infisical-sandbox-net";
const DOCKER_BIN = "/usr/local/bin/docker";
const DOCKER_VERSION = "27.3.1";
const CONTAINER_PREFIX = "infisical-sandbox-";

export const containerNameFor = (sandboxId: string) => `${CONTAINER_PREFIX}${sandboxId}`;

type TRunResult = { stdout: string; stderr: string; exitCode: number | null };

const run = (command: string, args: string[], opts: { stdin?: string; timeoutMs?: number } = {}) =>
  new Promise<TRunResult>((resolve) => {
    const child = spawn(command, args, { stdio: [opts.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;

    if (opts.timeoutMs) {
      timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr: stderr + error.message, exitCode: null });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });

    if (opts.stdin !== undefined) {
      child.stdin?.end(opts.stdin);
    }
  });

const docker = (args: string[], opts?: { stdin?: string; timeoutMs?: number }) => run(DOCKER_BIN, args, opts);

const dockerOrThrow = async (args: string[], what: string, opts?: { stdin?: string; timeoutMs?: number }) => {
  const result = await docker(args, opts);
  if (result.exitCode !== 0) {
    throw new Error(`${what} failed: ${(result.stderr || result.stdout).trim().slice(0, 400)}`);
  }
  return result.stdout.trim();
};

/**
 * The backend image does not ship the Docker CLI, and adding it means rebuilding an image shared by
 * every developer. It is a single static binary, so it is fetched on demand instead.
 */
const ensureDockerCli = async () => {
  const probe = await run(DOCKER_BIN, ["--version"]);
  if (probe.exitCode === 0) return;

  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const url = `https://download.docker.com/linux/static/stable/${arch}/docker-${DOCKER_VERSION}.tgz`;

  await run("sh", [
    "-c",
    `curl -fsSL -o /tmp/docker.tgz ${url} && tar -xzf /tmp/docker.tgz -C /tmp docker/docker --strip-components=1 && mv /tmp/docker ${DOCKER_BIN} && chmod +x ${DOCKER_BIN} && rm -f /tmp/docker.tgz`
  ]);

  const verify = await run(DOCKER_BIN, ["--version"]);
  if (verify.exitCode !== 0) {
    throw new Error("Could not install the Docker CLI, which the sandbox runtime needs to start containers");
  }

  logger.info(`Installed Docker CLI for the sandbox runtime [version=${DOCKER_VERSION}]`);
};

/** `internal` is the isolation: containers on this network have no route off it. */
const ensureNetwork = async () => {
  const existing = await docker(["network", "inspect", NETWORK, "--format", "{{.Name}}"]);
  if (existing.exitCode === 0) return;

  await dockerOrThrow(["network", "create", "--internal", NETWORK], "Creating the sandbox network");
  logger.info(`Created the sandbox network [network=${NETWORK}]`);
};

let cachedProxyHost: string | undefined;

/** The proxy listens inside the API container, so the sandbox reaches it at this address. */
export const getProxyHostAddress = async () => {
  if (cachedProxyHost) return cachedProxyHost;

  const hostname = process.env.HOSTNAME ?? "";
  const address = await docker([
    "inspect",
    hostname,
    "--format",
    `{{(index .NetworkSettings.Networks "${NETWORK}").IPAddress}}`
  ]);

  const ip = address.stdout.trim();
  if (address.exitCode !== 0 || !ip) {
    throw new Error(
      "The API container is not attached to the sandbox network, so a sandbox would have no route to its proxy"
    );
  }

  cachedProxyHost = ip;
  return ip;
};

/**
 * The API container has to sit on the sandbox network too, or the sandbox has no route to the proxy
 * and every brokered request fails with a connection error rather than a block.
 */
const ensureApiOnNetwork = async () => {
  const hostname = process.env.HOSTNAME ?? "";
  if (!hostname) throw new Error("Could not determine the API container, which the sandbox runtime needs");

  const attached = await docker([
    "inspect",
    hostname,
    "--format",
    `{{if (index .NetworkSettings.Networks "${NETWORK}")}}yes{{end}}`
  ]);

  if (attached.stdout.trim() === "yes") return;

  await dockerOrThrow(["network", "connect", NETWORK, hostname], "Attaching the API to the sandbox network");
  logger.info(`Attached the API container to the sandbox network [container=${hostname}]`);
};

const imageExists = async () => {
  const result = await docker(["image", "inspect", IMAGE, "--format", "{{.Id}}"]);
  return result.exitCode === 0;
};

export const ensureSandboxImage = async (dockerfile: string) => {
  if (await imageExists()) return;

  logger.info(`Building the sandbox image, which takes a minute on first use [image=${IMAGE}]`);
  // Built from stdin: the image installs packages and downloads gh, so it needs no build context.
  // The trailing `-` already means "Dockerfile on stdin, no context"; adding `-f -` as well claims
  // stdin twice and docker refuses.
  await dockerOrThrow(["build", "-q", "-t", IMAGE, "-"], "Building the sandbox image", {
    stdin: dockerfile,
    timeoutMs: 10 * 60_000
  });
  logger.info(`Built the sandbox image [image=${IMAGE}]`);
};

let hasReapedOnBoot = false;

/**
 * Containers outlive the API process, but the runtime's record of them does not, so a restart would
 * leave every sandbox container running with nothing able to reach or remove it. Reaped once per
 * process, not per sandbox, or starting a second sandbox would kill the first.
 */
const reapOrphanedContainers = async () => {
  if (hasReapedOnBoot) return;
  hasReapedOnBoot = true;

  const listed = await docker(["ps", "-aq", "--filter", "label=infisical.sandbox"]);
  const ids = listed.stdout.split("\n").filter(Boolean);
  if (!ids.length) return;

  await docker(["rm", "-f", ...ids]);
  logger.info(`Removed sandbox containers left by a previous run [count=${ids.length}]`);
};

export const prepareDockerRuntime = async (dockerfile: string, onLog: (line: string) => void = () => {}) => {
  await ensureDockerCli();
  await reapOrphanedContainers();
  await ensureNetwork();
  onLog(`Network ${NETWORK} ready (internal: no route to the internet)`);
  await ensureApiOnNetwork();

  if (!(await imageExists())) onLog(`Building ${IMAGE}; this only happens once`);
  await ensureSandboxImage(dockerfile);
  onLog(`Image ${IMAGE} ready`);
};

export const startContainer = async (
  sandboxId: string,
  resources: { vcpu: number; memoryMb: number },
  onLog: (line: string) => void = () => {}
) => {
  const name = containerNameFor(sandboxId);

  // A container left behind by a crash holds the name, so the next start would fail on the conflict.
  await docker(["rm", "-f", name]);

  await dockerOrThrow(
    [
      "run",
      "-d",
      "--name",
      name,
      "--network",
      NETWORK,
      // The sliders are the container's real limits, not decoration.
      `--cpus=${resources.vcpu}`,
      `--memory=${resources.memoryMb}m`,
      // A fork bomb in the sandbox should not take the API host down with it.
      "--pids-limit=512",
      "--security-opt=no-new-privileges",
      "--label",
      `infisical.sandbox=${sandboxId}`,
      IMAGE,
      "sleep",
      "infinity"
    ],
    `Starting the container for sandbox ${sandboxId}`
  );

  onLog(`Container ${name} started as user agent (non-root, no-new-privileges)`);
  logger.info(
    `Sandbox container started [sandboxId=${sandboxId}] [vcpu=${resources.vcpu}] [memoryMb=${resources.memoryMb}]`
  );
};

export const removeContainer = async (sandboxId: string) => {
  await docker(["rm", "-f", containerNameFor(sandboxId)]);
};

export const isContainerRunning = async (sandboxId: string) => {
  const result = await docker(["inspect", containerNameFor(sandboxId), "--format", "{{.State.Running}}"]);
  return result.exitCode === 0 && result.stdout.trim() === "true";
};

/** Writes a file inside the container without going through the shell, so content needs no quoting. */
export const writeFileInContainer = async (sandboxId: string, path: string, content: string) => {
  await dockerOrThrow(
    ["exec", "-i", "-u", "agent", containerNameFor(sandboxId), "sh", "-c", `cat > ${JSON.stringify(path)}`],
    `Writing ${path} into sandbox ${sandboxId}`,
    { stdin: content }
  );
};

export const execInContainer = async (
  sandboxId: string,
  script: string,
  opts: { cwd: string; env: Record<string, string>; timeoutMs: number }
): Promise<TRunResult> => {
  const envArgs = Object.entries(opts.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);

  // `timeout` runs inside the container, so a runaway command is killed there rather than being
  // orphaned when the CLI process goes away. The outer timeout is only a backstop for a stuck daemon.
  const seconds = Math.ceil(opts.timeoutMs / 1000);

  return docker(
    [
      "exec",
      "-u",
      "agent",
      "-w",
      opts.cwd,
      ...envArgs,
      containerNameFor(sandboxId),
      "timeout",
      "--signal=KILL",
      String(seconds),
      "bash",
      "-lc",
      script
    ],
    { timeoutMs: opts.timeoutMs + 10_000 }
  );
};

export type TContainerStats = {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
  networkIn: string;
  networkOut: string;
  processCount: number;
};

const toMb = (value: string) => {
  const amount = parseFloat(value) || 0;
  if (value.includes("GiB") || value.includes("GB")) return amount * 1024;
  if (value.includes("KiB") || value.includes("kB")) return amount / 1024;
  if (value.includes("B") && !value.includes("MiB") && !value.includes("MB")) return amount / 1024 / 1024;
  return amount;
};

/** One shot rather than a stream: the UI polls, and a stream would outlive the request. */
export const getContainerStats = async (sandboxId: string): Promise<TContainerStats | null> => {
  const result = await docker([
    "stats",
    containerNameFor(sandboxId),
    "--no-stream",
    "--format",
    "{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.PIDs}}"
  ]);

  if (result.exitCode !== 0) return null;

  const [cpu, mem, memPct, net, pids] = result.stdout.trim().split("\t");
  if (!cpu) return null;

  const [used, limit] = (mem ?? "").split(" / ");
  const [inbound, outbound] = (net ?? "").split(" / ");

  return {
    cpuPercent: parseFloat(cpu) || 0,
    memoryUsedMb: toMb(used ?? ""),
    memoryLimitMb: toMb(limit ?? ""),
    memoryPercent: parseFloat(memPct ?? "") || 0,
    networkIn: (inbound ?? "0B").trim(),
    networkOut: (outbound ?? "0B").trim(),
    processCount: Number(pids) || 0
  };
};
