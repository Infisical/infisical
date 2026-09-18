import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const childEnvironment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: "C.UTF-8",
  GIT_TERMINAL_PROMPT: "0",
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null"
};

function git(repo, args, maxBuffer = 1024 * 1024) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8", timeout: 30000, maxBuffer,
    env: childEnvironment
  });
  if (result.error || result.status !== 0) throw new Error("Git operation failed; check the repository and fetch both revisions with complete history.");
  return result.stdout;
}

export function resolveRange(repo, base, head) {
  const resolve = (ref) => {
    const sha = git(repo, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
    if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Git returned an invalid revision.");
    return sha;
  };
  const headSha = resolve(head);
  const baseSha = resolve(base);
  const mergeBase = git(repo, ["merge-base", baseSha, headSha]).trim();
  if (!/^[a-f0-9]{40,64}$/.test(mergeBase)) throw new Error("No common ancestor was found.");
  return { base: baseSha, head: headSha, mergeBase };
}

export function scanRepository({ repo, range, binary }) {
  const version = spawnSync(binary, ["version"], { encoding: "utf8", timeout: 10000, env: childEnvironment });
  if (version.error || version.status !== 0 || version.stdout.trim() !== "8.30.1") {
    throw new Error("Gitleaks failed version validation; install Gitleaks 8.30.1.");
  }
  const temp = mkdtempSync(join(tmpdir(), "infisical-secret-scan-"));
  try {
    const report = join(temp, "raw.json");
    const result = spawnSync(binary, [
      "git", repo, "--no-banner", "--no-color", "--log-level", "error",
      "--config", join(directory, "gitleaks.toml"),
      "--gitleaks-ignore-path", join(directory, "empty.gitleaksignore"),
      "--ignore-gitleaks-allow", "--exit-code", "10", "--timeout", "180",
      "--report-format", "json", "--report-path", report,
      "--log-opts", `--full-history --diff-merges=first-parent --no-ext-diff --no-textconv ${range.mergeBase}..${range.head}`
    ], { encoding: "utf8", timeout: 200000, maxBuffer: 1024 * 1024,
      env: childEnvironment
    });
    if (result.error || ![0, 10].includes(result.status)) {
      throw new Error("Gitleaks failed; verify the pinned binary is installed and the Git history is available.");
    }
    let findings;
    try { findings = JSON.parse(readFileSync(report, "utf8")); }
    catch { throw new Error("Gitleaks did not produce a valid report."); }
    if (!Array.isArray(findings) || findings.some((finding) =>
      typeof finding.File !== "string" || !Number.isInteger(finding.StartLine) || finding.StartLine < 1 ||
      !/^[a-f0-9]{40,64}$/.test(finding.Commit) || typeof finding.Secret !== "string" || !finding.Secret ||
      !/^[a-z0-9-]+$/.test(finding.RuleID)
    )) throw new Error("Gitleaks returned an invalid finding.");
    if ((result.status === 0) !== (findings.length === 0)) throw new Error("Gitleaks exit status and report disagree.");
    return findings;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function readFindingSource(repo, finding) {
  try {
    return git(repo, ["show", `${finding.Commit}:${finding.File}`], 2 * 1024 * 1024);
  } catch {
    return null;
  }
}
