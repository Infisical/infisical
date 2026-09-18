import { createHash } from "node:crypto";

export function publicFinding(finding, classification) {
  const file = finding.Secret ? finding.File.replaceAll(finding.Secret, "[REDACTED]") : finding.File;
  return {
    id: createHash("sha256").update(`${finding.Commit}:${file}:${finding.StartLine}:${finding.RuleID}`).digest("hex"),
    rule: finding.RuleID,
    file,
    line: finding.StartLine,
    commit: finding.Commit,
    classification
  };
}

export function buildSarif(report) {
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "Infisical contextual secret scan", version: "0.1.0" } },
      results: report.findings.map((finding) => ({
        ruleId: finding.rule,
        level: "warning",
        message: { text: `Potential secret. Context: ${finding.classification.assessment ?? finding.classification.reason}. AI context is advisory; this credential has not been verified or revoked.` },
        locations: [{ physicalLocation: {
          artifactLocation: { uri: finding.file.split("/").map(encodeURIComponent).join("/"), uriBaseId: "%SRCROOT%" },
          region: { startLine: finding.line }
        } }],
        partialFingerprints: { occurrence: finding.id },
        properties: { commit: finding.commit, classification: finding.classification }
      }))
    }]
  };
}

function escape(value) {
  return String(value).replace(/[&<>"'`|\\\r\n[\]()*!_#]/g, (character) => `&#${character.charCodeAt(0)};`);
}

export function buildSummary(report) {
  const classified = report.findings.filter((finding) => finding.classification.status === "classified").length;
  const lines = [
    "## Infisical contextual secret scan", "",
    `Mode: **${report.mode}**. Findings: **${report.findings.length}**. Classified: **${classified}**.`, "",
    report.classifier.enabled ? "Jev is enabled; individual failures are recorded below." : "Jev is disabled because no API key was supplied; deterministic scanning still ran.", "",
    "AI assessments are advisory and never suppress findings. Credential validity is not checked.",
    "Locations refer to the introducing commit, which may differ from the current file.", "",
    "| File | Line | Commit | Rule | File role | Credential use | Assessment |", "| --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const finding of report.findings.slice(0, 100)) {
    lines.push(`| ${escape(finding.file)} | ${finding.line} | ${finding.commit.slice(0, 12)} | ${escape(finding.rule)} | ${escape(finding.classification.answers?.fileRole ?? "unavailable")} | ${escape(finding.classification.answers?.credentialUse ?? "unavailable")} | ${escape(finding.classification.assessment ?? finding.classification.reason)} |`);
  }
  if (report.findings.length > 100) lines.push("", "The report artifacts contain the remaining findings.");
  if (report.mode === "monitor") lines.push("", "Monitor mode does not block on findings. Keep the existing secret-scanning check required.");
  return `${lines.join("\n")}\n`;
}
