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
import {
  InfraRunStatus,
  InfraRunType,
  TAiInsight,
  TCreateFileDTO,
  TDeleteFileDTO,
  TListRunsDTO,
  TPlanJson,
  TTriggerRunDTO
} from "./infra-types";

type TInfraServiceFactoryDep = {
  infraFileDAL: TInfraFileDALFactory;
  infraRunDAL: TInfraRunDALFactory;
  infraStateDAL: TInfraStateDALFactory;
};

// Concurrency guard — one run at a time per project
const activeRuns = new Set<string>();

export const infraServiceFactory = ({ infraFileDAL, infraRunDAL, infraStateDAL }: TInfraServiceFactoryDep) => {
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

    // Find the previous run's file snapshot for diffing.
    // Skip runs whose snapshot is identical (e.g. apply reuses the same files as its plan).
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
      const snap = JSON.stringify(typeof r.fileSnapshot === "string" ? JSON.parse(r.fileSnapshot) : r.fileSnapshot);
      return snap !== currentSnapshot;
    });
    if (prevRun?.fileSnapshot) {
      previousFileSnapshot = (typeof prevRun.fileSnapshot === "string"
        ? JSON.parse(prevRun.fileSnapshot)
        : prevRun.fileSnapshot) as Record<string, string>;
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
    return infraRunDAL.updateById(runId, { status: InfraRunStatus.Failed, logs: `${run.logs}\n[infra] Run denied by user.\n` });
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
    const state = await getState(projectId);
    if (!state?.content) return [];

    const stateObj = (typeof state.content === "string" ? JSON.parse(state.content) : state.content) as {
      resources?: Array<{
        type: string;
        name: string;
        provider: string;
        instances?: Array<{
          attributes?: Record<string, unknown>;
        }>;
      }>;
    };

    if (!stateObj.resources) return [];

    return stateObj.resources.map((r) => {
      // Provider string is like: provider["registry.opentofu.org/hashicorp/local"]
      const providerMatch = r.provider.match(/\/([^/"\]]+)\]?"?$/);
      const providerShort = providerMatch?.[1] ?? r.provider;
      const attrs = r.instances?.[0]?.attributes ?? {};
      return {
        type: r.type,
        name: r.name,
        provider: providerShort,
        address: `${r.type}.${r.name}`,
        attributes: attrs
      };
    });
  };

  // ── Runner ──

  const triggerRun = async (
    dto: TTriggerRunDTO,
    onData: (chunk: string) => void,
    onComplete: (run: {
      id: string;
      status: string;
      planJson?: TPlanJson | null;
      aiSummary?: string | null;
    }) => void
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

    if (dto.mode === "apply") {
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

    const run = await infraRunDAL.create({
      projectId: dto.projectId,
      type: dto.mode === "apply" ? InfraRunType.Apply : InfraRunType.Plan,
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
        appendLog(`[infra] Writing ${file.name}\n`);
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
      appendLog(`[infra] Configured HTTP state backend\n`);

      const binary = await findTofu();
      appendLog(`[infra] Using binary: ${binary}\n`);

      appendLog(`[infra] Running ${binary} init...\n`);
      await execCommand(binary, ["init", "-no-color"], tmpDir, appendLog);

      // For plan: run plan, save plan file, parse JSON, run AI
      // For apply: check approval gate first, then apply
      let planJson: TPlanJson | null = null;
      let aiSummary: string | null = null;

      if (dto.mode === "plan") {
        appendLog(`\n[infra] Running ${binary} plan...\n`);
        await execCommand(binary, ["plan", "-no-color", "-out=plan.tfplan"], tmpDir, appendLog);

        // Parse plan JSON programmatically
        try {
          appendLog(`[infra] Parsing plan output...\n`);
          const jsonOutput = await captureCommand(binary, ["show", "-json", "plan.tfplan"], tmpDir);
          planJson = parsePlanJson(jsonOutput);
          appendLog(`[infra] Changes: +${planJson.add} added, ~${planJson.change} changed, -${planJson.destroy} destroyed\n`);
        } catch (parseErr) {
          logger.warn(parseErr, "Failed to parse plan JSON");
        }

        // AI analysis
        try {
          const insight = await generateAiInsight(fullLogs, planJson);
          if (insight) {
            aiSummary = JSON.stringify(insight);
            appendLog(`[infra] AI analysis complete\n`);
          }
        } catch (aiErr) {
          logger.warn(aiErr, "AI insight generation failed");
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
        appendLog(`\n[infra] Running ${binary} plan...\n`);
        await execCommand(binary, ["plan", "-no-color", "-out=plan.tfplan"], tmpDir, appendLog);

        // Parse plan to get accurate changes
        try {
          appendLog(`[infra] Parsing plan output...\n`);
          const jsonOutput = await captureCommand(binary, ["show", "-json", "plan.tfplan"], tmpDir);
          planJson = parsePlanJson(jsonOutput);
          appendLog(`[infra] Changes: +${planJson.add} added, ~${planJson.change} changed, -${planJson.destroy} destroyed\n`);
        } catch (parseErr) {
          logger.warn(parseErr, "Failed to parse plan JSON");
        }

        // Check if we need approval based on cached plan insight
        if (cachedAiInsight?.security?.shouldApprove) {
          appendLog(`[infra] Security issues detected. Awaiting approval...\n`);
          await infraRunDAL.updateById(run.id, {
            status: InfraRunStatus.AwaitingApproval,
            logs: fullLogs,
            planJson: planJson as unknown as string,
            aiSummary: JSON.stringify(cachedAiInsight)
          });
          onComplete({ id: run.id, status: InfraRunStatus.AwaitingApproval, planJson, aiSummary: JSON.stringify(cachedAiInsight) });
          activeRuns.delete(dto.projectId);
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return;
        }

        appendLog(`\n[infra] Running ${binary} apply...\n`);
        await execCommand(binary, ["apply", "plan.tfplan", "-no-color"], tmpDir, appendLog);

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
    getState,
    upsertState,
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

function execCommand(binary: string, args: string[], cwd: string, onData: (chunk: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.on("data", (data: Buffer) => onData(data.toString()));
    proc.stderr.on("data", (data: Buffer) => onData(data.toString()));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${binary} exited with code ${code}`))));
    proc.on("error", reject);
  });
}

function captureCommand(binary: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const proc = spawn(binary, args, { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    proc.stderr.on("data", () => {});
    proc.on("close", (code) => (code === 0 ? resolve(output) : reject(new Error(`${binary} exited with code ${code}`))));
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

    if (action !== "no-op") {
      resources.push({ action, type: rc.type, name: rc.name, address: rc.address });
    }
  }

  return { add, change, destroy, resources };
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

  try {
    return JSON.parse(text) as TAiInsight;
  } catch {
    logger.warn("Failed to parse AI insight JSON, returning as summary");
    return {
      summary: text,
      costs: { estimated: [], aiEstimated: [], totalMonthly: "N/A", deltaMonthly: "N/A" },
      security: { issues: [], shouldApprove: false }
    };
  }
}
