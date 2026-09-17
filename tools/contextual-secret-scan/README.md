# Contextual secret scanning for CI

This standalone CI scanner combines Gitleaks 8.30.1 detection with optional Jev contextual classification. It runs alongside the existing GitGuardian integration; it does not change GitGuardian settings or branch protection.

The default **monitor** mode reports every finding without blocking on findings. **Enforce** mode fails on every finding, including likely test fixtures. AI assessments never suppress detections. A scanner failure fails either mode.

## Enable it in this repository

The workflow is `.github/workflows/contextual-secret-scan.yml`. After it is merged, it runs on pull requests and can also be run manually from GitHub Actions.

1. Keep GitGuardian required while evaluating this check.
2. Add an Actions repository secret named `AI_GATEWAY_API_KEY` containing a Vercel AI Gateway key with access to `typesafe-ai/jev`.
3. Set the Actions repository variable `CONTEXTUAL_SECRET_SCAN_AI_ENABLED` to `true` after approving the external processing described below.
4. Open a pull request. The **Contextual secret scan** job publishes a summary and a `contextual-secret-scan` artifact containing `findings.json`, `findings.sarif`, and `summary.md`.

Without the key or opt-in variable, deterministic detection still runs and findings are marked `missing-api-key`. Fork pull requests do not receive the repository secret, so they also run detection without Jev. No `pull_request_target` workflow is used.

To enforce findings, set `CONTEXTUAL_SECRET_SCAN_MODE` to `enforce`, then make **Contextual secret scan** a required check in the repository ruleset. Setting the variable alone does not make a check required. Leave GitGuardian in place until you have evaluated this scanner's coverage and operational behavior; a passing monitor check is not a security gate.

For a manual run, provide a base revision and select `monitor` or `enforce`. The head is the branch selected in the Actions run dialog. The scanner checks commits from the common ancestor of base and head through head, not the entire repository history.

## Run locally or from another CI system

Use Node.js 24, Git, and Gitleaks 8.30.1. Install the scanner from a trusted checkout, not the branch being scanned.

```sh
cd tools/contextual-secret-scan
npm ci --ignore-scripts
bash install-gitleaks.sh .bin
npm run check
npm test

node scan.mjs \
  --repo ../.. \
  --base origin/main \
  --head HEAD \
  --mode monitor \
  --gitleaks "$PWD/.bin/gitleaks" \
  --output reports
```

The installer supports Linux x86_64 and checks a pinned SHA-256 checksum. On another platform, install Gitleaks 8.30.1 separately and supply its path with `--gitleaks`. Both revisions and their history must be fetched. The scanner reads Git objects; it does not scan uncommitted files or execute the target application's code.

Supply `AI_GATEWAY_API_KEY` through your CI's secret store or local secret manager to enable Jev. Do not put the key in command arguments or configuration files. In local runs the presence of this variable is the opt-in; the GitHub workflow additionally requires the repository opt-in variable.

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | The scan completed. Monitor mode may still have findings. |
| `1` | Enforce mode found at least one potential secret. |
| `2` | Configuration, Git, scanner, or report-writing failure. No clean result was established. |

The default classification budget is 50 findings per scan, configurable with `--max-classifications` from 0 to 1000. Every finding is still reported and enforced after that budget is exhausted. Each evaluation has a 15-second timeout and no retries. Authentication, credit, and rate-limit errors stop further classification requests for that run without stopping detection or enforcement. Classification is sequential; increasing the budget can require a larger CI timeout.

## What Jev evaluates

Jev answers three typed questions: the file's role, the candidate credential's apparent use, and whether the evidence supports a synthetic placeholder. Findings receive one of these advisory assessments:

- `likely-test-fixture`: all three answers support test-only, isolated or mocked, synthetic use, each with a selected probability of at least 0.95.
- `needs-review`: the answers meet that threshold but do not all support a test fixture.
- `uncertain`: at least one answer is unknown or below the threshold.

The threshold is an initial routing heuristic, not a calibrated security guarantee. Unavailable classifications include a reason such as `missing-api-key`, `timeout`, `rate-limited`, `authentication-failed`, `payment-required`, `request-failed`, `invalid-response`, or `classification-budget-exceeded`. They never remove or downgrade the enforcement of a finding. Jev's free tier can rate-limit consecutive requests; provision sufficient Gateway credits for CI rather than treating partial classification as a clean result.

JavaScript and TypeScript files receive a bounded token window around the finding at its introducing commit. Other languages, and files whose source cannot be read within the size limit, receive file-role metadata only. This MVP does not perform cross-file data-flow analysis, check credential validity, match against Infisical-managed secrets, or rotate credentials.

## Data handling and trust boundaries

Raw Gitleaks findings are held in memory and in a temporary directory accessible only to the runner's user. The directory is removed in a `finally` block. Raw findings, credential values, code excerpts, commit messages, and author details are not included in exported reports.

Before a Jev request, the scanner transforms code locally:

- Comments are removed, so comment instructions are not sent to the model.
- Literal contents are replaced with categories such as candidate credential, loopback URL, network URL, or redacted literal. Numeric values are removed too.
- Custom identifiers become opaque `symbol-N` aliases. Only a fixed vocabulary of test, network, and credential-related identifiers is retained.
- Paths become test/fixture/documentation flags and a language category; the original path is not sent.

This transformation deliberately sacrifices some semantic information to avoid sending source values and private names. The remaining code structure and derived metadata still leave your infrastructure. Requests go through Vercel AI Gateway to TypeSafe AI with `zeroDataRetention: true`. Review both providers' contractual and operational controls before enabling it; that request flag is not a substitute for your own data-handling review.

Sanitized artifacts retain file paths, line numbers, rule IDs, commit hashes, and validated classification results. They contain repository metadata and should remain private. GitHub retains them for seven days. SARIF locations refer to introducing commits and may not match the current checkout; this workflow uploads SARIF as an artifact, not automatically to GitHub code scanning.

The CI scan job runs tooling from the repository's default branch. It reads PR source as Git data and does not install or execute the target application. Tests run separately without the Gateway key. Before the scanner first lands on the default branch, the workflow uses the PR's tooling in a credential-free bootstrap run. As with other `pull_request` workflows, protect workflow changes and restrict who can push branches in the repository; a collaborator able to change workflows can change their secret handling.

The scanner uses its own default-rule configuration and empty ignore file. PR-supplied `.gitleaks.toml`, `.gitleaksignore`, and `gitleaks:allow` directives cannot disable it. Gitleaks' built-in detector allowlists and coverage limitations still apply. There is no custom suppression mechanism in this MVP.

## Validation and rollout

`npm test` runs offline tests against the real pinned Gitleaks binary and synthetic Git histories. It covers detection in test files, secrets removed before the head commit, attempts to bypass scanning, redaction, classification budgets, enforcement, and provider failures. The Jev tests use injected responses; they do not establish real-model accuracy.

Before replacing an existing required check, run the two scanners alongside each other on representative changes. Review missed detections and false alarms separately from contextual labels. Also test live Jev responses with synthetic credentials, an invalid key, and the key disabled. Enforce mode must continue blocking all detected findings regardless of these classifier results.
