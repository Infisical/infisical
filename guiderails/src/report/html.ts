import fs from "node:fs";
import path from "node:path";

import { formatUsage, type UsageTotals } from "../llm.js";
import { REPORTS_DIR } from "../paths.js";
import type { Finding, RunResult, StepOutcome } from "../types.js";

/**
 * Self-contained HTML report. Images are inlined as data URIs so the file survives being
 * downloaded from a CI artifact bundle and opened on its own, which is where it will actually
 * be read.
 */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dataUri = (filePath: string | undefined): string | null => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const extension = path.extname(filePath).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
};

const OUTCOME_LABEL: Record<StepOutcome, string> = {
  passed: "verified",
  failed: "could not complete",
  skipped: "skipped",
  unverified: "not verifiable here"
};

const findingBlock = (finding: Finding): string => {
  const docShot = dataUri(finding.evidence.docScreenshot);
  const liveShot = dataUri(finding.evidence.liveScreenshot);

  const comparison =
    docShot && liveShot
      ? `<div class="shots">
           <figure><figcaption>documentation</figcaption><img src="${docShot}" alt="documentation screenshot"></figure>
           <figure><figcaption>live</figcaption><img src="${liveShot}" alt="live screenshot"></figure>
         </div>`
      : "";

  return `<div class="finding ${finding.blame.toLowerCase()}">
    <div class="finding-head">
      <span class="sev">${finding.severity}</span>
      <span class="blame">${finding.blame.replace("_", " ").toLowerCase()}</span>
      <span class="loc">step ${finding.stepIndex} &middot; line ${finding.sourceQuote.line}</span>
    </div>
    <p class="summary">${escapeHtml(finding.summary)}</p>
    <dl>
      <dt>the guide says</dt><dd>${escapeHtml(finding.docSays)}</dd>
      <dt>the app shows</dt><dd>${escapeHtml(finding.appShows)}</dd>
      <dt>quoted from</dt><dd class="quote">${escapeHtml(finding.sourceQuote.text)}</dd>
    </dl>
    ${comparison}
  </div>`;
};

const guideSection = (result: RunResult): string => {
  const rows = result.steps
    .map(
      (step) => `<tr class="${step.outcome}">
        <td class="num">${step.docStepIndex}</td>
        <td>${escapeHtml(step.instruction)}</td>
        <td class="outcome">${OUTCOME_LABEL[step.outcome]}</td>
        <td class="how">${step.resolvedBy}${step.toolCalls > 0 ? ` &middot; ${step.toolCalls} calls` : ""}</td>
        <td class="ms">${step.durationMs > 0 ? `${(step.durationMs / 1000).toFixed(1)}s` : ""}</td>
      </tr>`
    )
    .join("\n");

  const findings = result.findings.map(findingBlock).join("\n");

  const unverified =
    result.unverified.length > 0
      ? `<div class="unverified"><h4>Not verified</h4><ul>${result.unverified
          .map((region) => `<li>${escapeHtml(region.reason)}</li>`)
          .join("")}</ul></div>`
      : "";

  return `<section>
    <h2>${escapeHtml(result.guide)}</h2>
    <p class="meta">${escapeHtml(result.baseUrl)} &middot; mode ${result.mode}</p>
    <table><thead><tr><th></th><th>step</th><th>outcome</th><th>resolved by</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
    ${findings}
    ${unverified}
  </section>`;
};

const STYLE = `
:root {
  --bg: #ffffff; --fg: #11181c; --muted: #6b7785; --line: #e4e8ed;
  --pass: #12805c; --fail: #c4320a; --warn: #a15c00; --skip: #6b7785;
  --code-bg: #f6f8fa;
}
:root:not([data-theme="light"]) { }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0d1117; --fg: #e6edf3; --muted: #8d96a0; --line: #21262d;
    --pass: #3fb950; --fail: #f85149; --warn: #d29922; --skip: #8d96a0;
    --code-bg: #161b22;
  }
}
:root[data-theme="dark"] {
  --bg: #0d1117; --fg: #e6edf3; --muted: #8d96a0; --line: #21262d;
  --pass: #3fb950; --fail: #f85149; --warn: #d29922; --skip: #8d96a0;
  --code-bg: #161b22;
}
* { box-sizing: border-box; }
body {
  background: var(--bg); color: var(--fg); margin: 0; padding: 2rem 1.25rem 4rem;
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 62rem; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.1rem; margin: 2.5rem 0 .25rem; }
.meta, .sub { color: var(--muted); font-size: .875rem; margin: 0 0 1rem; }
table { width: 100%; border-collapse: collapse; margin: .75rem 0 1.5rem; font-size: .9rem; }
th { text-align: left; font-weight: 600; color: var(--muted); font-size: .75rem;
     text-transform: uppercase; letter-spacing: .04em; padding: .4rem .5rem; }
td { padding: .45rem .5rem; border-top: 1px solid var(--line); vertical-align: top; }
td.num, td.ms, td.how { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
tr.passed td.outcome { color: var(--pass); }
tr.failed td.outcome { color: var(--fail); font-weight: 600; }
tr.unverified td.outcome { color: var(--warn); }
tr.skipped td.outcome { color: var(--skip); }
.finding { border: 1px solid var(--line); border-left: 3px solid var(--muted);
           border-radius: 6px; padding: .85rem 1rem; margin: .75rem 0; }
.finding.doc_drift { border-left-color: var(--warn); }
.finding.app_regression { border-left-color: var(--fail); }
.finding.harness { border-left-color: var(--skip); opacity: .8; }
.finding-head { display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap;
                font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.sev { font-weight: 700; }
.blame, .loc { color: var(--muted); }
.summary { margin: .5rem 0 .6rem; font-weight: 500; }
dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: .25rem .75rem; font-size: .9rem; }
dt { color: var(--muted); white-space: nowrap; }
dd { margin: 0; }
dd.quote { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem;
           background: var(--code-bg); padding: .1rem .35rem; border-radius: 3px; }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: .85rem; }
.shots figure { margin: 0; }
.shots figcaption { color: var(--muted); font-size: .75rem; text-transform: uppercase;
                    letter-spacing: .04em; margin-bottom: .3rem; }
.shots img { width: 100%; max-width: 100%; border: 1px solid var(--line); border-radius: 4px; }
.unverified { border: 1px dashed var(--line); border-radius: 6px; padding: .5rem 1rem; margin: 1rem 0; }
.unverified h4 { margin: .3rem 0; font-size: .8rem; text-transform: uppercase;
                 letter-spacing: .04em; color: var(--muted); }
.unverified ul { margin: .3rem 0 .5rem; padding-left: 1.2rem; font-size: .875rem; color: var(--muted); }
.totals { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: .9rem; margin: 1rem 0 0; }
.totals b { font-variant-numeric: tabular-nums; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line);
         color: var(--muted); font-size: .8rem; }
@media (max-width: 40rem) { .shots { grid-template-columns: 1fr; } table { display: block; overflow-x: auto; } }
`;

export const renderHtmlReport = (results: RunResult[], usage: UsageTotals): string => {
  const totals = results.reduce(
    (acc, result) => {
      for (const step of result.steps) acc[step.outcome] += 1;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0, unverified: 0 }
  );

  const findings = results.flatMap((result) => result.findings);
  const counts = {
    docDrift: findings.filter((f) => f.blame === "DOC_DRIFT").length,
    appRegression: findings.filter((f) => f.blame === "APP_REGRESSION").length,
    harness: findings.filter((f) => f.blame === "HARNESS").length
  };

  return `<title>Guiderails report</title>
<style>${STYLE}</style>
<main>
  <h1>Guiderails</h1>
  <p class="sub">${results.length} guide(s) walked against a live instance on ${escapeHtml(
    new Date().toISOString()
  )}</p>
  <div class="totals">
    <span><b>${totals.passed}</b> verified</span>
    <span><b>${totals.failed}</b> could not complete</span>
    <span><b>${totals.unverified}</b> not verifiable</span>
    <span><b>${totals.skipped}</b> skipped</span>
    <span><b>${counts.docDrift}</b> docs out of date</span>
    <span><b>${counts.appRegression}</b> possible app regression</span>
    <span><b>${counts.harness}</b> harness</span>
  </div>
  ${results.map(guideSection).join("\n")}
  <footer>
    Advisory check. It walks each guide with an agent and can be wrong, which is why every
    finding above quotes the guide text it came from and names which side it believes is
    at fault.<br>${escapeHtml(formatUsage(usage))}
  </footer>
</main>`;
};

export const writeHtmlReport = (results: RunResult[], usage: UsageTotals): string => {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const target = path.join(REPORTS_DIR, "index.html");
  fs.writeFileSync(target, renderHtmlReport(results, usage));
  return target;
};
