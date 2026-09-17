import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { run } from "./scan.mjs";
import { resolveRange } from "./scanner.mjs";

const binary = fileURLToPath(new URL(".bin/gitleaks", import.meta.url));
const candidate = ["ghp", createHash("sha256").update("synthetic scanner fixture").digest("hex").slice(0, 36)].join("_");

function repository(t) {
  assert.ok(existsSync(binary), "Run bash install-gitleaks.sh .bin before running tests.");
  const root = mkdtempSync(join(tmpdir(), "contextual-scanner-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, "Fixture Git operation failed");
    return result.stdout.trim();
  };
  git("init", "-q");
  git("symbolic-ref", "HEAD", "refs/heads/fixture");
  let parent;
  const commit = (file, content) => {
    const input = `commit refs/heads/fixture\ncommitter Scanner Fixture <fixture@example.invalid> 1000000000 +0000\ndata 7\nfixture\n${parent ? `from ${parent}\n` : ""}M 100644 inline ${JSON.stringify(file)}\ndata ${Buffer.byteLength(content)}\n${content}\n\ndone\n`;
    const result = spawnSync("git", ["-C", root, "fast-import", "--quiet"], { input, encoding: "utf8" });
    assert.equal(result.status, 0, "Fixture import failed");
    parent = git("rev-parse", "HEAD");
    return parent;
  };
  const base = commit("README", "Initial fixture\n");
  return {
    root, git, commit,
    options: { repo: root, base, head: "HEAD", mode: "monitor", binary, output: join(root, "reports"), maxClassifications: 50 }
  };
}

test("real scanner finds a credential in a test file and redacts all exported artifacts", async (t) => {
  const { commit, options } = repository(t);
  commit("tests/client.test.ts", `const token = "${candidate}";\nfetch("https://private.example.net", { headers: { authorization: token } });\n`);
  let calls = 0;
  const classifier = async (state) => {
    calls++;
    assert.equal(state.file.testPath, true);
    assert.ok(!JSON.stringify(state).includes(candidate));
    assert.ok(state.tokens.includes("fetch"));
    return { status: "classified", assessment: "needs-review" };
  };
  const { report, exitCode } = await run(options, { apiKey: "fake-test-key", classifier });
  assert.ok(report.findings.length > 0);
  assert.equal(calls, report.findings.length);
  assert.equal(exitCode, 0);
  for (const file of ["findings.json", "findings.sarif", "summary.md"]) {
    const content = readFileSync(join(options.output, file), "utf8");
    assert.ok(!content.includes(candidate));
    assert.ok(!content.includes("private.example.net"));
    assert.ok(!content.includes("fake-test-key"));
  }
});

test("enforcement blocks even likely fixtures and missing classification", async (t) => {
  const { commit, options } = repository(t);
  commit("fixture.ts", `const token = "${candidate}";\n`);
  options.mode = "enforce";
  const fixture = await run(options, { apiKey: "fake-test-key", classifier: async () => ({ status: "classified", assessment: "likely-test-fixture" }) });
  assert.equal(fixture.exitCode, 1);
  const offline = await run(options, { apiKey: "" });
  assert.equal(offline.exitCode, 1);
  assert.ok(offline.report.findings.every((finding) => finding.classification.reason === "missing-api-key"));
});

test("commit-range scanning catches a credential removed before the PR head", async (t) => {
  const { commit, options } = repository(t);
  const introduced = commit("client.ts", `const token = "${candidate}";\n`);
  commit("client.ts", "const token = process.env.TOKEN;\n");
  const result = await run(options, { apiKey: "" });
  assert.ok(result.report.findings.some((finding) => finding.commit === introduced));
});

test("a PR cannot suppress findings with repo config, ignore files or inline directives", async (t) => {
  const { commit, options } = repository(t);
  commit(".gitleaks.toml", '[allowlist]\npaths = [".*"]\n');
  const sha = commit("client.ts", `const token = "${candidate}"; // gitleaks:allow\n`);
  commit(".gitleaksignore", `${sha}:client.ts:github-pat:1\n`);
  const result = await run(options, { apiKey: "" });
  assert.ok(result.report.findings.length > 0);
});

test("classification budget does not limit detection or enforcement", async (t) => {
  const { commit, options } = repository(t);
  commit("client.ts", `const token = "${candidate}";\n`);
  const result = await run({ ...options, mode: "enforce", maxClassifications: 0 }, {
    apiKey: "fake-test-key", classifier: async () => { assert.fail("Budget must prevent the request"); }
  });
  assert.equal(result.exitCode, 1);
  assert.ok(result.report.findings.every((finding) => finding.classification.reason === "classification-budget-exceeded"));
});

test("provider rate limits stop further requests but retain and enforce every finding", async (t) => {
  const { commit, options } = repository(t);
  commit("client.ts", `const token = "${candidate}";\n`);
  commit("another.ts", `const token = "${candidate}";\n`);
  let calls = 0;
  const result = await run({ ...options, mode: "enforce" }, {
    apiKey: "fake-test-key", classifier: async () => {
      calls++;
      return { status: "unavailable", reason: "rate-limited" };
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 1);
  assert.ok(result.report.findings.length >= 2);
  assert.ok(result.report.findings.every((finding) => finding.classification.reason === "rate-limited"));
});

test("clean ranges pass and pre-existing secrets outside the range do not block", async (t) => {
  const { commit, options } = repository(t);
  options.base = commit("old.ts", `const token = "${candidate}";\n`);
  commit("new.ts", "export const greeting = 'hello';\n");
  const result = await run({ ...options, mode: "enforce" }, { apiKey: "" });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.report.findings, []);
});

test("scanner failures and invalid refs are errors, never clean reports", async (t) => {
  const { options } = repository(t);
  await assert.rejects(run({ ...options, binary: "/nonexistent/scanner" }), /Gitleaks failed/);
  assert.throws(() => resolveRange(options.repo, "--bad-ref", "HEAD"), /Git operation failed/);
  await assert.rejects(run({ ...options, mode: "invalid" }), /Mode must/);
  await assert.rejects(run({ ...options, maxClassifications: NaN }), /max-classifications/);
  assert.equal(existsSync(join(options.output, "findings.json")), false);
});

test("CLI exit codes distinguish monitor, enforce, and operational failures without logging secrets", (t) => {
  const { commit, options } = repository(t);
  commit("client.ts", `const token = "${candidate}";\n`);
  for (const [mode, expected] of [["monitor", 0], ["enforce", 1], ["invalid", 2]]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("scan.mjs", import.meta.url)),
      "--repo", options.repo, "--base", options.base, "--mode", mode,
      "--gitleaks", binary, "--output", options.output
    ], { encoding: "utf8", env: { ...process.env, AI_GATEWAY_API_KEY: "" } });
    assert.equal(result.status, expected);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(candidate));
  }
});
