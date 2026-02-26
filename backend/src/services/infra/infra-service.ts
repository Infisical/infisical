import crypto from "crypto";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TInfraFileDALFactory } from "./infra-file-dal";
import { TInfraRunDALFactory } from "./infra-run-dal";
import { TInfraStateDALFactory } from "./infra-state-dal";
import { TInfraVariableDALFactory } from "./infra-variable-dal";
import {
  InfraRunStatus,
  InfraRunType,
  TAiInsight,
  TCreateFileDTO,
  TDeleteFileDTO,
  TDeleteVariableDTO,
  TListRunsDTO,
  TPlanJson,
  TTriggerRunDTO,
  TUpsertVariableDTO
} from "./infra-types";

type TInfraServiceFactoryDep = {
  infraFileDAL: TInfraFileDALFactory;
  infraRunDAL: TInfraRunDALFactory;
  infraStateDAL: TInfraStateDALFactory;
  infraVariableDAL: TInfraVariableDALFactory;
};

// Concurrency guard — one run at a time per project
const activeRuns = new Set<string>();

export const infraServiceFactory = ({
  infraFileDAL,
  infraRunDAL,
  infraStateDAL,
  infraVariableDAL
}: TInfraServiceFactoryDep) => {
  // ── File CRUD ──

  const listFiles = async (projectId: string) => {
    return infraFileDAL.find({ projectId });
  };

  const upsertFile = async (dto: TCreateFileDTO) => {
    const existing = await infraFileDAL.find({ projectId: dto.projectId, name: dto.name });
    if (existing.length > 0) {
      return infraFileDAL.updateById(existing[0].id, { content: dto.content });
    }
    return infraFileDAL.create({ projectId: dto.projectId, name: dto.name, content: dto.content });
  };

  const deleteFile = async (dto: TDeleteFileDTO) => {
    const results = await infraFileDAL.delete({ projectId: dto.projectId, name: dto.name });
    return results[0];
  };

  const getFileChecksums = async (projectId: string) => {
    const files = await infraFileDAL.find({ projectId });
    const checksums: Record<string, string> = {};
    for (const f of files) {
      checksums[f.name] = crypto.createHash("sha256").update(f.content).digest("hex");
    }
    return checksums;
  };

  // ── Runs ──

  const listRuns = async (dto: TListRunsDTO) => {
    return infraRunDAL.find(
      { projectId: dto.projectId },
      { limit: dto.limit ?? 50, offset: dto.offset ?? 0, sort: [["createdAt", "desc"]] }
    );
  };

  const getRun = async (runId: string) => {
    const run = await infraRunDAL.findById(runId);

    // No diff data for failed or denied runs
    if (run.status === InfraRunStatus.Failed || run.status === InfraRunStatus.Denied) {
      return { ...run, previousFileSnapshot: null };
    }

    // Find the previous successful run's file snapshot for diffing.
    // Skip failed runs and runs whose snapshot is identical (e.g. apply reuses the same files as its plan).
    let previousFileSnapshot: Record<string, string> | null = null;
    const currentSnapshot = run.fileSnapshot
      ? JSON.stringify(typeof run.fileSnapshot === "string" ? JSON.parse(run.fileSnapshot) : run.fileSnapshot)
      : null;

    const olderRuns = await infraRunDAL.find(
      { projectId: run.projectId },
      { limit: 50, offset: 0, sort: [["createdAt", "desc"]] }
    );
    const prevRun = olderRuns.find((r) => {
      if (new Date(r.createdAt) >= new Date(run.createdAt)) return false;
      if (!r.fileSnapshot) return false;
      if (r.status === InfraRunStatus.Failed) return false;
      const snap = JSON.stringify(typeof r.fileSnapshot === "string" ? JSON.parse(r.fileSnapshot) : r.fileSnapshot);
      return snap !== currentSnapshot;
    });
    if (prevRun?.fileSnapshot) {
      previousFileSnapshot = (
        typeof prevRun.fileSnapshot === "string" ? JSON.parse(prevRun.fileSnapshot) : prevRun.fileSnapshot
      ) as Record<string, string>;
    }

    return { ...run, previousFileSnapshot };
  };

  const approveRun = async (runId: string) => {
    const run = await infraRunDAL.findById(runId);
    if (run.status !== InfraRunStatus.AwaitingApproval) {
      throw new BadRequestError({ message: "Run is not awaiting approval" });
    }
    return infraRunDAL.updateById(runId, { status: InfraRunStatus.Running });
  };

  const denyRun = async (runId: string) => {
    const run = await infraRunDAL.findById(runId);
    if (run.status !== InfraRunStatus.AwaitingApproval) {
      throw new BadRequestError({ message: "Run is not awaiting approval" });
    }
    return infraRunDAL.updateById(runId, {
      status: InfraRunStatus.Denied,
      logs: `${run.logs}\n[infra] Run denied by user.\n`,
      planJson: null,
      aiSummary: null
    });
  };

  // ── State Backend ──

  const getState = async (projectId: string) => {
    const states = await infraStateDAL.find({ projectId });
    return states[0] ?? null;
  };

  const upsertState = async (projectId: string, content: unknown) => {
    const existing = await infraStateDAL.find({ projectId });
    if (existing.length > 0) {
      return infraStateDAL.updateById(existing[0].id, { content });
    }
    return infraStateDAL.create({ projectId, content });
  };

  // ── Resources (parsed from state) ──

  const getResources = async (projectId: string) => {
    // Resources from state (already applied)
    const stateResources: Array<{
      type: string;
      name: string;
      provider: string;
      address: string;
      attributes: Record<string, unknown>;
      dependsOn: string[];
    }> = [];

    const state = await getState(projectId);
    if (state?.content) {
      const stateObj = (typeof state.content === "string" ? JSON.parse(state.content) : state.content) as {
        resources?: Array<{
          type: string;
          name: string;
          provider: string;
          depends_on?: string[];
          instances?: Array<{
            attributes?: Record<string, unknown>;
          }>;
        }>;
      };

      if (stateObj.resources) {
        for (const r of stateObj.resources) {
          const providerMatch = r.provider.match(/\/([^/"\]]+)\]?"?$/);
          const providerShort = providerMatch?.[1] ?? r.provider;
          const attrs = r.instances?.[0]?.attributes ?? {};
          stateResources.push({
            type: r.type,
            name: r.name,
            provider: providerShort,
            address: `${r.type}.${r.name}`,
            attributes: attrs,
            dependsOn: r.depends_on ?? []
          });
        }
      }
    }

    // Merge in resources and dependency data from the latest plan
    const addressSet = new Set(stateResources.map((r) => r.address));

    const latestRuns = await infraRunDAL.find(
      { projectId, status: InfraRunStatus.Success },
      { limit: 1, sort: [["createdAt", "desc"]] }
    );
    const latestPlanJson = latestRuns[0]?.planJson as unknown as TPlanJson | null;

    if (latestPlanJson?.resources) {
      // Build a lookup of plan dependency data (richer than state depends_on)
      const planDepMap = new Map<string, string[]>();
      for (const r of latestPlanJson.resources) {
        if (r.dependsOn?.length) {
          planDepMap.set(r.address, r.dependsOn);
        }
      }

      for (const r of latestPlanJson.resources) {
        if (addressSet.has(r.address)) {
          // Resource exists in state — enrich its dependencies with plan data
          const planDeps = planDepMap.get(r.address);
          if (planDeps?.length) {
            const existing = stateResources.find((s) => s.address === r.address);
            if (existing) {
              const merged = new Set([...existing.dependsOn, ...planDeps]);
              existing.dependsOn = Array.from(merged);
            }
          }
        } else {
          // Resource only in plan (not yet applied)
          stateResources.push({
            type: r.type,
            name: r.name,
            provider: "unknown",
            address: r.address,
            attributes: {},
            dependsOn: r.dependsOn ?? []
          });
          addressSet.add(r.address);
        }
      }
    }

    return stateResources;
  };

  const getGraph = async (projectId: string) => {
    const resources = await getResources(projectId);
    const addressSet = new Set(resources.map((r) => r.address));

    const nodes = resources.map((r) => ({
      id: r.address,
      type: r.type,
      name: r.name,
      provider: r.provider
    }));

    // Build edges from all resource dependencies (state + plan merged)
    const edgeSet = new Set<string>();
    const edges: Array<{ source: string; target: string }> = [];

    for (const r of resources) {
      for (const dep of r.dependsOn) {
        if (addressSet.has(dep)) {
          const key = `${dep}->${r.address}`;
          if (!edgeSet.has(key)) {
            edges.push({ source: dep, target: r.address });
            edgeSet.add(key);
          }
        }
      }
    }

    return { nodes, edges };
  };

  // ── Runner ──

  const triggerRun = async (
    dto: TTriggerRunDTO,
    onData: (chunk: string) => void,
    onComplete: (run: { id: string; status: string; planJson?: TPlanJson | null; aiSummary?: string | null }) => void
  ) => {
    // Concurrency guard
    if (activeRuns.has(dto.projectId)) {
      throw new BadRequestError({ message: "A run is already in progress for this project" });
    }
    activeRuns.add(dto.projectId);

    // Snapshot files
    const files = await infraFileDAL.find({ projectId: dto.projectId });
    if (files.length === 0) {
      activeRuns.delete(dto.projectId);
      throw new BadRequestError({ message: "No .tf files found. Create files in the Editor first." });
    }

    const fileSnapshot: Record<string, string> = {};
    for (const f of files) {
      fileSnapshot[f.name] = f.content;
    }

    // For apply, look up cached AI insight from the latest plan (to check approval gate)
    let planRunId: string | null = null;
    let cachedAiInsight: TAiInsight | null = null;

    if (dto.mode === "apply" || dto.mode === "destroy") {
      const recentPlans = await infraRunDAL.find(
        { projectId: dto.projectId, type: InfraRunType.Plan, status: InfraRunStatus.Success },
        { limit: 1, sort: [["createdAt", "desc"]] }
      );
      const latestPlan = recentPlans[0];
      if (latestPlan) {
        planRunId = latestPlan.id;
        if (latestPlan.aiSummary) {
          try {
            cachedAiInsight = JSON.parse(latestPlan.aiSummary) as TAiInsight;
          } catch {
            // not valid JSON, ignore
          }
        }
      }
    }

    const runType =
      dto.mode === "destroy" ? InfraRunType.Destroy : dto.mode === "apply" ? InfraRunType.Apply : InfraRunType.Plan;

    const run = await infraRunDAL.create({
      projectId: dto.projectId,
      type: runType,
      status: InfraRunStatus.Running,
      logs: "",
      fileSnapshot,
      triggeredBy: dto.userId ?? null,
      planRunId
    });

    let fullLogs = "";
    const appendLog = (chunk: string) => {
      fullLogs += chunk;
      onData(chunk);
    };

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `infra-${run.id}-`));

    try {
      for (const file of files) {
        await fs.writeFile(path.join(tmpDir, file.name), file.content, "utf-8");
      }

      // Generate backend.tf for HTTP state backend (no locking — we handle it at service level)
      const appCfg = getConfig();
      const backendUrl = `${appCfg.SITE_URL || "http://localhost:8080"}/api/v1/infra/${dto.projectId}/state`;
      const backendTf = `terraform {
  backend "http" {
    address    = "${backendUrl}"
  }
}
`;
      await fs.writeFile(path.join(tmpDir, "backend_override.tf"), backendTf, "utf-8");

      const binary = await findTofu();

      // Fetch project variables and build env map for tofu child process
      const variables = await infraVariableDAL.find({ projectId: dto.projectId });
      const varEnv: Record<string, string> = {};
      for (const v of variables) {
        varEnv[v.key] = v.value;
      }

      // Init: capture output but only surface it if init fails
      let initOutput = "";
      try {
        await execCommand(
          binary,
          ["init"],
          tmpDir,
          (chunk) => {
            initOutput += chunk;
          },
          varEnv
        );
      } catch (initErr) {
        // Surface init output so the user can see what went wrong
        fullLogs += initOutput;
        onData(initOutput);
        throw initErr;
      }

      // For plan: run plan, save plan file, parse JSON, run AI
      // For apply: check approval gate first, then apply
      let planJson: TPlanJson | null = null;
      let aiSummary: string | null = null;

      let rawPlanJsonOutput: string | null = null;

      if (dto.mode === "plan") {
        await execCommand(binary, ["plan", "-out=plan.tfplan", "-compact-warnings"], tmpDir, appendLog, varEnv);

        try {
          rawPlanJsonOutput = await captureCommand(binary, ["show", "-json", "plan.tfplan"], tmpDir, varEnv);
          planJson = parsePlanJson(rawPlanJsonOutput);
        } catch (parseErr) {
          logger.warn(parseErr, "Failed to parse plan JSON");
        }

        // Enrich with dependency graph from `tofu graph`
        if (planJson) {
          try {
            const dotOutput = await captureCommand(binary, ["graph"], tmpDir);
            const dotDeps = parseDotGraph(dotOutput);
            enrichPlanWithGraphDeps(planJson, dotDeps);
          } catch (graphErr) {
            logger.warn(graphErr, "Failed to enrich plan with tofu graph");
          }
        }

        // AI analysis
        try {
          const insight = await generateAiInsight(fullLogs, planJson);
          if (insight) {
            aiSummary = JSON.stringify(insight);
          }
        } catch (aiErr) {
          logger.warn(aiErr, "AI insight generation failed");
        }
        // Build insight from plan JSON with static cost estimates
        const insight = buildInsightFromCosts(planJson, rawPlanJsonOutput);
        aiSummary = JSON.stringify(insight);

        await infraRunDAL.updateById(run.id, {
          status: InfraRunStatus.Success,
          logs: fullLogs,
          planJson: planJson as unknown as string,
          aiSummary
        });

        onComplete({ id: run.id, status: InfraRunStatus.Success, planJson, aiSummary });
      } else if (dto.mode === "destroy") {
        // Destroy mode — plan with -destroy flag, require approval before executing

        await execCommand(binary, ["plan", "-destroy", "-out=plan.tfplan", "-compact-warnings"], tmpDir, appendLog);

        try {
          const jsonOutput = await captureCommand(binary, ["show", "-json", "plan.tfplan"], tmpDir);
          planJson = parsePlanJson(jsonOutput);
        } catch (parseErr) {
          logger.warn(parseErr, "Failed to parse plan JSON");
        }

        // Enrich with dependency graph from `tofu graph`
        if (planJson) {
          try {
            const dotOutput = await captureCommand(binary, ["graph"], tmpDir);
            const dotDeps = parseDotGraph(dotOutput);
            enrichPlanWithGraphDeps(planJson, dotDeps);
          } catch (graphErr) {
            logger.warn(graphErr, "Failed to enrich plan with tofu graph");
          }
        }

        if (!dto.approved) {
          // First destroy attempt — require approval
          // AI analysis
          try {
            const insight = await generateAiInsight(fullLogs, planJson);
            if (insight) aiSummary = JSON.stringify(insight);
          } catch (aiErr) {
            logger.warn(aiErr, "AI insight generation failed");
          }

          appendLog(`\n[infra] Destroy plan ready. Awaiting approval...\n`);
          await infraRunDAL.updateById(run.id, {
            status: InfraRunStatus.AwaitingApproval,
            logs: fullLogs,
            planJson: planJson as unknown as string,
            aiSummary
          });
          onComplete({ id: run.id, status: InfraRunStatus.AwaitingApproval, planJson, aiSummary });
          activeRuns.delete(dto.projectId);
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return;
        }

        // Approved — execute the destroy plan
        appendLog(`\n`);
        await execCommand(binary, ["apply", "plan.tfplan"], tmpDir, appendLog);

        // Generate AI insight or reuse cached
        if (cachedAiInsight) {
          aiSummary = JSON.stringify(cachedAiInsight);
        } else {
          try {
            const insight = await generateAiInsight(fullLogs, planJson);
            if (insight) aiSummary = JSON.stringify(insight);
          } catch (aiErr) {
            logger.warn(aiErr, "AI insight generation failed");
          }
        }

        await infraRunDAL.updateById(run.id, {
          status: InfraRunStatus.Success,
          logs: fullLogs,
          planJson: planJson as unknown as string,
          aiSummary
        });

        onComplete({ id: run.id, status: InfraRunStatus.Success, planJson, aiSummary });
      } else {
        // Apply mode — always run plan first to get fresh change data
        await execCommand(binary, ["plan", "-out=plan.tfplan", "-compact-warnings"], tmpDir, appendLog, varEnv);

        try {
          rawPlanJsonOutput = await captureCommand(binary, ["show", "-json", "plan.tfplan"], tmpDir, varEnv);
          planJson = parsePlanJson(rawPlanJsonOutput);
        } catch (parseErr) {
          logger.warn(parseErr, "Failed to parse plan JSON");
        }

        // Enrich with dependency graph from `tofu graph`
        if (planJson) {
          try {
            const dotOutput = await captureCommand(binary, ["graph"], tmpDir);
            const dotDeps = parseDotGraph(dotOutput);
            enrichPlanWithGraphDeps(planJson, dotDeps);
          } catch (graphErr) {
            logger.warn(graphErr, "Failed to enrich plan with tofu graph");
          }
        }

        // Check if we need approval based on cached plan insight
        if (cachedAiInsight?.security?.shouldApprove) {
          appendLog(`\n[infra] Security issues detected. Awaiting approval...\n`);
          await infraRunDAL.updateById(run.id, {
            status: InfraRunStatus.AwaitingApproval,
            logs: fullLogs,
            planJson: planJson as unknown as string,
            aiSummary: JSON.stringify(cachedAiInsight)
          });
          onComplete({
            id: run.id,
            status: InfraRunStatus.AwaitingApproval,
            planJson,
            aiSummary: JSON.stringify(cachedAiInsight)
          });
          activeRuns.delete(dto.projectId);
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return;
        }

        appendLog(`\n`);
        await execCommand(binary, ["apply", "plan.tfplan"], tmpDir, appendLog, varEnv);

        // Generate AI insight or reuse cached
        if (cachedAiInsight) {
          aiSummary = JSON.stringify(cachedAiInsight);
        } else {
          const applyInsight = buildInsightFromCosts(planJson, rawPlanJsonOutput);
          aiSummary = JSON.stringify(applyInsight);
        }

        await infraRunDAL.updateById(run.id, {
          status: InfraRunStatus.Success,
          logs: fullLogs,
          planJson: planJson as unknown as string,
          aiSummary
        });

        onComplete({ id: run.id, status: InfraRunStatus.Success, planJson, aiSummary });
      }
    } catch (err) {
      logger.error(err, "Infra run failed");
      const errMsg = `\n[infra] Error: ${err instanceof Error ? err.message : String(err)}\n`;
      fullLogs += errMsg;
      onData(errMsg);

      await infraRunDAL.updateById(run.id, { status: InfraRunStatus.Failed, logs: fullLogs });
      onComplete({ id: run.id, status: InfraRunStatus.Failed });
    } finally {
      activeRuns.delete(dto.projectId);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  // ── Variable CRUD ──

  const listVariables = async (projectId: string) => {
    const vars = await infraVariableDAL.find({ projectId });
    // Mask sensitive values in the response
    return vars.map((v) => ({
      ...v,
      value: v.sensitive ? "••••••••" : v.value
    }));
  };

  const upsertVariable = async (dto: TUpsertVariableDTO) => {
    const existing = await infraVariableDAL.find({ projectId: dto.projectId, key: dto.key });
    if (existing.length > 0) {
      const updated = await infraVariableDAL.updateById(existing[0].id, {
        value: dto.value,
        sensitive: dto.sensitive ?? existing[0].sensitive
      });
      return updated;
    }
    return infraVariableDAL.create({
      projectId: dto.projectId,
      key: dto.key,
      value: dto.value,
      sensitive: dto.sensitive ?? false
    });
  };

  const deleteVariable = async (dto: TDeleteVariableDTO) => {
    const existing = await infraVariableDAL.find({ projectId: dto.projectId, key: dto.key });
    if (existing.length === 0) {
      throw new BadRequestError({ message: `Variable "${dto.key}" not found` });
    }
    await infraVariableDAL.deleteById(existing[0].id);
  };

  return {
    listFiles,
    upsertFile,
    deleteFile,
    getFileChecksums,
    listRuns,
    getRun,
    approveRun,
    denyRun,
    getResources,
    getGraph,
    getState,
    upsertState,
    listVariables,
    upsertVariable,
    deleteVariable,
    triggerRun
  };
};

export type TInfraService = ReturnType<typeof infraServiceFactory>;

// ── Helpers ──

async function findTofu(): Promise<string> {
  const searchPaths = ["tofu", "/usr/bin/tofu", "/usr/local/bin/tofu", "/opt/homebrew/bin/tofu", "/snap/bin/tofu"];
  for (const p of searchPaths) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(p, ["version"], { stdio: "ignore" });
        proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("not found"))));
        proc.on("error", reject);
      });
      return p;
    } catch {
      // next
    }
  }
  throw new Error("OpenTofu (tofu) binary not found");
}

function execCommand(
  binary: string,
  args: string[],
  cwd: string,
  onData: (chunk: string) => void,
  extraEnv: Record<string, string> = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      cwd,
      env: { ...process.env, TF_FORCE_COLOR: "1", ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"]
    });
    proc.stdout.on("data", (data: Buffer) => onData(data.toString()));
    proc.stderr.on("data", (data: Buffer) => onData(data.toString()));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${binary} exited with code ${code}`))));
    proc.on("error", reject);
  });
}

function captureCommand(
  binary: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const proc = spawn(binary, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"]
    });
    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr.on("data", () => {});
    proc.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${binary} exited with code ${code}`))
    );
    proc.on("error", reject);
  });
}

function parsePlanJson(jsonOutput: string): TPlanJson {
  const parsed = JSON.parse(jsonOutput) as {
    resource_changes?: Array<{
      address: string;
      type: string;
      name: string;
      change: { actions: string[] };
    }>;
  };

  const changes = parsed.resource_changes ?? [];
  let add = 0;
  let change = 0;
  let destroy = 0;
  const resources: TPlanJson["resources"] = [];

  for (const rc of changes) {
    const actions = rc.change.actions;
    let action = "no-op";
    if (actions.includes("delete") && actions.includes("create")) {
      action = "replace";
      change += 1;
    } else if (actions.includes("create")) {
      action = "create";
      add += 1;
    } else if (actions.includes("update")) {
      action = "update";
      change += 1;
    } else if (actions.includes("delete")) {
      action = "delete";
      destroy += 1;
    }

    resources.push({
      action,
      type: rc.type,
      name: rc.name,
      address: rc.address,
      dependsOn: []
    });
  }

  return { add, change, destroy, resources };
}

/**
 * Parse `tofu graph` DOT output and extract resource→resource dependency edges.
 * Node labels look like: "[root] infisical_project.tf-project (expand)"
 * Edge lines look like: "source_label" -> "target_label"
 * We extract the resource address (type.name) from each label, skipping provider/output/root nodes.
 */
function parseDotGraph(dot: string): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();

  // Extract resource address from a DOT node label like "[root] infisical_project.tf-project (expand)"
  const extractAddress = (label: string): string | null => {
    // Remove [root] prefix and (expand)/(close) suffix
    const cleaned = label
      .replace(/^\[root\]\s+/, "")
      .replace(/\s+\(expand\)$/, "")
      .replace(/\s+\(close\)$/, "")
      .trim();
    // Must be a resource address: type.name (with possible hyphens/underscores)
    if (/^[a-z][\w]*\.[\w-]+$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  };

  // Match edge lines: "label1" -> "label2"
  const edgeRegex = /"([^"]+)"\s*->\s*"([^"]+)"/g;
  let match = edgeRegex.exec(dot);
  while (match) {
    const sourceAddr = extractAddress(match[1]);
    const targetAddr = extractAddress(match[2]);
    // Edge direction in DOT is source -> target, meaning source depends on target
    // So targetAddr is the dependency of sourceAddr
    if (sourceAddr && targetAddr) {
      if (!deps.has(sourceAddr)) deps.set(sourceAddr, new Set());
      deps.get(sourceAddr)!.add(targetAddr);
    }
    match = edgeRegex.exec(dot);
  }

  return deps;
}

/** Enrich planJson resources with dependency data from `tofu graph` DOT output */
function enrichPlanWithGraphDeps(planJson: TPlanJson, dotDeps: Map<string, Set<string>>): void {
  for (const r of planJson.resources) {
    const deps = dotDeps.get(r.address);
    if (deps) {
      const merged = new Set([...r.dependsOn, ...deps]);
      // Remove self-references
      merged.delete(r.address);
      r.dependsOn = Array.from(merged);
    }
  }
}

async function generateAiInsight(logs: string, planJson: TPlanJson | null): Promise<TAiInsight | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const truncatedLogs = logs.length > 15000 ? logs.slice(-15000) : logs;

  const prompt = `OpenTofu plan/apply output:
${truncatedLogs}

Parsed resource changes (programmatic):
${planJson ? JSON.stringify(planJson, null, 2) : "Not available"}

Produce a JSON response with this exact schema:
{
  "summary": "string — markdown summary under 200 words",
  "costs": {
    "estimated": [{"resource": "string", "monthlyCost": "string", "source": "string"}],
    "aiEstimated": [{"resource": "string", "monthlyCost": "string", "confidence": "high|medium|low"}],
    "totalMonthly": "string",
    "deltaMonthly": "string"
  },
  "security": {
    "issues": [{"severity": "critical|high|medium|low", "resource": "string", "description": "string", "recommendation": "string"}],
    "shouldApprove": false
  }
}

Rules:
- For costs: estimate based on typical cloud pricing. Set confidence level.
- For security: flag networking misconfigurations, overly permissive access, unencrypted data, exposed credentials.
- Set shouldApprove to true ONLY for critical or high severity security issues.
- Output valid JSON only. No markdown fences, no extra text.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You are a DevOps and security expert embedded in Infisical Infra. Analyze OpenTofu output and produce structured JSON insights. Never output markdown fences — only raw JSON."
            }
          ]
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    logger.warn(`Gemini API returned ${response.status}`);
    return null;
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  // Static monthly cost estimates for common AWS/GCP/Azure resource types (USD)
  // These are approximate on-demand prices for typical configurations
  const RESOURCE_COST_TABLE: Record<string, number> = {
    // AWS Compute
    aws_instance: 8.35, // t3.micro
    aws_launch_template: 0,
    aws_autoscaling_group: 0, // pricing from instances
    aws_lambda_function: 0.2,
    aws_ecs_service: 0,
    aws_ecs_task_definition: 0,
    // AWS Storage
    aws_s3_bucket: 0.023, // per GB, estimate 1GB base
    aws_ebs_volume: 2.4, // 30GB gp3
    aws_efs_file_system: 0.3,
    aws_dynamodb_table: 1.25,
    // AWS Database
    aws_db_instance: 12.41, // db.t3.micro
    aws_rds_cluster: 29.2,
    aws_elasticache_cluster: 11.52,
    aws_redshift_cluster: 180.0,
    // AWS Networking
    aws_lb: 16.2, // ALB
    aws_alb: 16.2,
    aws_nat_gateway: 32.4,
    aws_eip: 3.6,
    aws_vpc: 0,
    aws_subnet: 0,
    aws_security_group: 0,
    aws_route_table: 0,
    aws_internet_gateway: 0,
    aws_route53_zone: 0.5,
    aws_cloudfront_distribution: 1.0,
    aws_api_gateway_rest_api: 3.5,
    aws_apigatewayv2_api: 1.0,
    // AWS Other
    aws_sqs_queue: 0.4,
    aws_sns_topic: 0,
    aws_kms_key: 1.0,
    aws_secretsmanager_secret: 0.4,
    aws_ecr_repository: 0,
    aws_cloudwatch_log_group: 0.5,
    aws_iam_role: 0,
    aws_iam_policy: 0,
    aws_iam_user: 0,
    // GCP
    google_compute_instance: 7.67,
    google_storage_bucket: 0.02,
    google_sql_database_instance: 25.55,
    google_container_cluster: 72.0,
    // Azure
    azurerm_virtual_machine: 14.6,
    azurerm_storage_account: 0.02,
    azurerm_sql_database: 4.9,
    azurerm_kubernetes_cluster: 72.0
  };

  function estimateResourceCosts(rawPlanJson: string): Array<{ resource: string; monthlyCost: number; type: string }> {
    try {
      const plan = JSON.parse(rawPlanJson) as {
        resource_changes?: Array<{
          address: string;
          type: string;
          change?: { actions?: string[] };
        }>;
        planned_values?: {
          root_module?: {
            resources?: Array<{ address: string; type: string; values?: Record<string, unknown> }>;
            child_modules?: Array<{
              resources?: Array<{ address: string; type: string; values?: Record<string, unknown> }>;
            }>;
          };
        };
      };

      const costs: Array<{ resource: string; monthlyCost: number; type: string }> = [];

      // Use resource_changes for the list of resources being created/updated
      const changes = plan.resource_changes ?? [];
      for (const rc of changes) {
        const actions = rc.change?.actions ?? [];
        // Skip resources being deleted or with no-op
        if (actions.includes("delete") && !actions.includes("create")) continue;
        if (actions.length === 1 && actions[0] === "no-op") continue;

        const baseCost = RESOURCE_COST_TABLE[rc.type];
        if (baseCost !== undefined && baseCost > 0) {
          costs.push({ resource: rc.address, monthlyCost: baseCost, type: rc.type });
        } else if (baseCost === undefined) {
          // Unknown resource type — check if it looks like a billable resource (not IAM, not data sources)
          // For unknown types, estimate $0 (free) rather than guessing
          costs.push({ resource: rc.address, monthlyCost: 0, type: rc.type });
        }
      }

      // If no resource_changes, fall back to planned_values
      if (changes.length === 0 && plan.planned_values?.root_module) {
        const allResources = [
          ...(plan.planned_values.root_module.resources ?? []),
          ...(plan.planned_values.root_module.child_modules ?? []).flatMap((m) => m.resources ?? [])
        ];
        for (const r of allResources) {
          const baseCost = RESOURCE_COST_TABLE[r.type];
          if (baseCost !== undefined && baseCost > 0) {
            costs.push({ resource: r.address, monthlyCost: baseCost, type: r.type });
          }
        }
      }

      return costs;
    } catch (err) {
      logger.warn(err, "Failed to estimate resource costs from plan JSON");
      return [];
    }
  }

  function buildInsightFromCosts(planJson: TPlanJson | null, rawPlanJsonOutput: string | null): TAiInsight {
    const estimated: TAiInsight["costs"]["estimated"] = [];
    let totalMonthly = "N/A";
    let deltaMonthly = "N/A";

    // Estimate costs from the raw plan JSON
    if (rawPlanJsonOutput) {
      const costs = estimateResourceCosts(rawPlanJsonOutput);
      let total = 0;
      for (const c of costs) {
        if (c.monthlyCost > 0) {
          estimated.push({
            resource: c.resource,
            monthlyCost: `$${c.monthlyCost.toFixed(2)}`,
            source: "estimate"
          });
          total += c.monthlyCost;
        }
      }
      if (total > 0 || costs.length > 0) {
        totalMonthly = `$${total.toFixed(2)}`;
        deltaMonthly = `+$${total.toFixed(2)}`;
      }
    }

    // Build a simple summary from plan changes
    let summary = "No changes detected.";
    if (planJson) {
      const parts: string[] = [];
      if (planJson.add > 0) parts.push(`**${planJson.add}** to add`);
      if (planJson.change > 0) parts.push(`**${planJson.change}** to change`);
      if (planJson.destroy > 0) parts.push(`**${planJson.destroy}** to destroy`);
      if (parts.length > 0) {
        summary = `Plan: ${parts.join(", ")}.`;
        if (planJson.resources.length > 0) {
          const resourceList = planJson.resources.map((r) => `- \`${r.address}\` (${r.action})`).join("\n");
          summary += `\n\n${resourceList}`;
        }
      }
      if (totalMonthly !== "N/A") {
        summary += `\n\nEstimated cost: ${totalMonthly}/mo`;
        if (deltaMonthly !== "N/A") summary += ` (${deltaMonthly})`;
      }
    }

    return {
      summary,
      costs: {
        estimated,
        aiEstimated: [],
        totalMonthly,
        deltaMonthly
      },
      security: { issues: [], shouldApprove: false }
    };
  }
}
