import assert from "node:assert/strict";
import test from "node:test";
import { buildSarif, buildSummary, publicFinding } from "./report.mjs";

test("reports explicitly select public fields and omit credential-bearing detector fields", () => {
  const raw = {
    File: "src/file.ts", StartLine: 3, Commit: "a".repeat(40), RuleID: "generic-api-key",
    Secret: "private-value", Match: "private-value", Author: "Private Name", Email: "private@example.invalid", Message: "Private message"
  };
  const finding = publicFinding(raw, { status: "unavailable", reason: "timeout" });
  assert.deepEqual(Object.keys(finding), ["id", "rule", "file", "line", "commit", "classification"]);
  assert.ok(!JSON.stringify(finding).includes("private-value"));
  assert.equal(finding.id, publicFinding(raw, finding.classification).id);
});

test("summary paths cannot inject Markdown links, HTML or table rows", () => {
  const finding = publicFinding({
    File: "[click](https://example.invalid)/<script>|\n**bad**.ts", StartLine: 1,
    Commit: "a".repeat(40), RuleID: "generic-api-key", Secret: "private-value"
  }, { status: "unavailable", reason: "missing-api-key" });
  const summary = buildSummary({ mode: "monitor", classifier: { enabled: false }, findings: [finding] });
  assert.ok(!summary.includes("[click]("));
  assert.ok(!summary.includes("<script>"));
  assert.ok(!summary.includes("**bad**"));
  assert.ok(summary.includes("Jev is disabled"));
  const sarif = buildSarif({ findings: [finding] });
  assert.equal(sarif.runs[0].results[0].properties.commit, finding.commit);
  assert.ok(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri.includes("%5Bclick%5D"));
});

test("a credential embedded in a file path is redacted from reports", () => {
  const finding = publicFinding({
    File: "src/private-value.ts", StartLine: 1, Commit: "a".repeat(40), RuleID: "generic-api-key", Secret: "private-value"
  }, { status: "unavailable", reason: "timeout" });
  assert.equal(finding.file, "src/[REDACTED].ts");
});
