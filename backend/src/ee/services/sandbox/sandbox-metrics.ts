import { spawn } from "node:child_process";

import { logger } from "@app/lib/logger";

import { DOCKER_BIN, SANDBOX_LABEL } from "./sandbox-docker";

/**
 * Live resource usage per sandbox, sampled from the container runtime itself rather than estimated.
 *
 * One `docker stats` call covers every sandbox on the host, so the cost does not scale with the
 * number of sandboxes. Samples are kept in a ring buffer so the UI can draw recent history without
 * a time-series store: this is a dev prototype, and losing the history on restart is acceptable when
 * the containers do not outlive the process either.
 */

/**
 * Fast on purpose. `docker stats --no-stream` costs a process spawn per tick, which is fine for the
 * handful of sandboxes a demo runs and would want backing off for real fleets.
 */
const SAMPLE_INTERVAL_MS = 1_000;
/** Ninety seconds of history at the sample interval, which is what the charts show. */
const MAX_SAMPLES = 90;

export type TSandboxSample = {
  at: number;
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
};

export type TSandboxMetrics = {
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  networkInKb: number;
  networkOutKb: number;
  processes: number;
  /** Oldest first, so a chart can render it directly. */
  samples: TSandboxSample[];
};

type TDockerStatsRow = {
  Name?: string;
  CPUPerc?: string;
  MemUsage?: string;
  NetIO?: string;
  PIDs?: string;
};

const history = new Map<string, TSandboxSample[]>();
const latest = new Map<string, Omit<TSandboxMetrics, "samples">>();
let timer: NodeJS.Timeout | undefined;

/** `1.5GiB / 2GiB`, `524KiB / 2GiB`, `872B / 126B` — the unit varies per sample. */
const toMb = (value: string): number => {
  const match = value.trim().match(/^([\d.]+)\s*([A-Za-z]*)$/);
  if (!match) return 0;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;

  const scale: Record<string, number> = {
    b: 1 / 1024 / 1024,
    kb: 1 / 1024,
    kib: 1 / 1024,
    mb: 1,
    mib: 1,
    gb: 1024,
    gib: 1024,
    tb: 1024 * 1024,
    tib: 1024 * 1024
  };

  return amount * (scale[match[2].toLowerCase()] ?? 0);
};

const toKb = (value: string) => toMb(value) * 1024;

const splitPair = (value: string | undefined) => {
  const [left = "0B", right = "0B"] = (value ?? "").split("/").map((part) => part.trim());
  return { left, right };
};

const run = (args: string[]) =>
  new Promise<string>((resolve) => {
    const child = spawn(DOCKER_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.on("error", () => resolve(""));
    child.on("close", () => resolve(stdout));
  });

// `docker stats` takes container ids as arguments and has no --filter, so the set is resolved with
// `docker ps` first. Still two calls total regardless of how many sandboxes are running.
const sampleOnce = async () => {
  const listed = await run(["ps", "-q", "--filter", `label=${SANDBOX_LABEL}`]);
  const ids = listed.split("\n").filter(Boolean);
  if (!ids.length) return;

  const stdout = await run(["stats", "--no-stream", "--format", "{{json .}}", ...ids]);
  const at = Date.now();

  stdout
    .split("\n")
    .filter(Boolean)
    .forEach((line) => {
      let row: TDockerStatsRow;
      try {
        row = JSON.parse(line) as TDockerStatsRow;
      } catch {
        return;
      }

      const sandboxId = (row.Name ?? "").replace("infisical-sandbox-", "");
      if (!sandboxId || sandboxId === row.Name) return;

      const memory = splitPair(row.MemUsage);
      const network = splitPair(row.NetIO);
      const cpuPercent = Number((row.CPUPerc ?? "0").replace("%", "")) || 0;

      const sample: TSandboxSample = {
        at,
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        memoryMb: Math.round(toMb(memory.left) * 10) / 10,
        memoryLimitMb: Math.round(toMb(memory.right))
      };

      const series = history.get(sandboxId) ?? [];
      series.push(sample);
      if (series.length > MAX_SAMPLES) series.shift();
      history.set(sandboxId, series);

      latest.set(sandboxId, {
        cpuPercent: sample.cpuPercent,
        memoryMb: sample.memoryMb,
        memoryLimitMb: sample.memoryLimitMb,
        networkInKb: Math.round(toKb(network.left)),
        networkOutKb: Math.round(toKb(network.right)),
        processes: Number(row.PIDs ?? "0") || 0
      });
    });
};

export const startSandboxMetrics = () => {
  if (timer) return;

  timer = setInterval(() => {
    void sampleOnce().catch((error: Error) => logger.error(error, "Sandbox metrics sampling failed"));
  }, SAMPLE_INTERVAL_MS);

  // Unref'd so a running sampler cannot hold the process open during shutdown.
  timer.unref();
  void sampleOnce();
};

export const stopSandboxMetrics = () => {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
};

/** Dropped when a sandbox stops so a restarted one does not inherit the old container's history. */
export const forgetSandboxMetrics = (sandboxId: string) => {
  history.delete(sandboxId);
  latest.delete(sandboxId);
};

export const getSandboxMetrics = (sandboxId: string): TSandboxMetrics | null => {
  const current = latest.get(sandboxId);
  if (!current) return null;

  return { ...current, samples: history.get(sandboxId) ?? [] };
};

/** Compact form for list views: the current reading plus a CPU series for a sparkline. */
export const getSandboxCpuSeries = (sandboxId: string) => {
  const samples = history.get(sandboxId);
  if (!samples?.length) return null;

  return {
    cpuPercent: latest.get(sandboxId)?.cpuPercent ?? 0,
    memoryMb: latest.get(sandboxId)?.memoryMb ?? 0,
    series: samples.map((sample) => sample.cpuPercent)
  };
};
