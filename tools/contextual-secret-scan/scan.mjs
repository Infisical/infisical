import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { classify, MODEL_ID } from "./classifier.mjs";
import { buildContext } from "./context.mjs";
import { buildSarif, buildSummary, publicFinding } from "./report.mjs";
import { readFindingSource, resolveRange, scanRepository } from "./scanner.mjs";

export async function run(options, { classifier = classify, apiKey = process.env.AI_GATEWAY_API_KEY } = {}) {
  if (!["monitor", "enforce"].includes(options.mode)) throw new Error("Mode must be monitor or enforce.");
  if (!Number.isInteger(options.maxClassifications) || options.maxClassifications < 0 || options.maxClassifications > 1000) {
    throw new Error("max-classifications must be an integer between 0 and 1000.");
  }
  const range = resolveRange(options.repo, options.base, options.head);
  const findings = scanRepository({ repo: options.repo, range, binary: options.binary });
  const report = { version: 1, mode: options.mode, range, classifier: { model: MODEL_ID, enabled: Boolean(apiKey?.trim()) }, findings: [] };
  let pausedReason;
  for (const [index, finding] of findings.entries()) {
    let classification = { status: "unavailable", reason: "classification-budget-exceeded" };
    if (!apiKey) classification = { status: "unavailable", reason: "missing-api-key" };
    else if (pausedReason) classification = { status: "unavailable", reason: pausedReason };
    else if (index < options.maxClassifications) {
      const state = buildContext({
        file: finding.File, line: finding.StartLine, secret: finding.Secret,
        source: readFindingSource(options.repo, finding)
      });
      classification = await classifier(state, { apiKey });
      if (["rate-limited", "authentication-failed", "payment-required"].includes(classification.reason)) {
        pausedReason = classification.reason;
      }
    }
    report.findings.push(publicFinding(finding, classification));
  }
  mkdirSync(options.output, { recursive: true, mode: 0o700 });
  for (const [name, content] of [
    ["findings.json", JSON.stringify(report, null, 2)],
    ["findings.sarif", JSON.stringify(buildSarif(report), null, 2)],
    ["summary.md", buildSummary(report)]
  ]) writeFileSync(resolve(options.output, name), content, { mode: 0o600 });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, buildSummary(report));
  return { report, exitCode: options.mode === "enforce" && findings.length ? 1 : 0 };
}

async function main() {
  const { values } = parseArgs({ options: {
    repo: { type: "string", default: "." },
    base: { type: "string" },
    head: { type: "string", default: "HEAD" },
    mode: { type: "string", default: "monitor" },
    output: { type: "string", default: "reports" },
    gitleaks: { type: "string", default: "gitleaks" },
    "max-classifications": { type: "string", default: "50" },
    help: { type: "boolean", default: false }
  } });
  if (values.help) {
    console.log("Usage: node scan.mjs --repo PATH --base REF [--head REF] [--mode monitor|enforce] [--gitleaks PATH] [--output PATH] [--max-classifications 50]");
    return;
  }
  if (!values.base) throw new Error("--base is required; use the target branch revision for a pull request.");
  const { report, exitCode } = await run({
    repo: resolve(values.repo), base: values.base, head: values.head, mode: values.mode,
    binary: values.gitleaks, output: resolve(values.output), maxClassifications: Number(values["max-classifications"])
  });
  console.log(`Secret scan complete: ${report.findings.length} finding(s), mode=${report.mode}. See the sanitized report artifacts.`);
  process.exitCode = exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Secret scan failed. Verify CLI arguments, Git history, output permissions, and the pinned Gitleaks installation. No clean result was produced.");
    process.exitCode = 2;
  });
}
