# Secret scanning scans and GitHub pull request checks

Read before changing scan triggers, `secret-scanning-v2-queue.ts`, or the GitHub pull request check flow.

- A scan's `trigger` (`SecretScanningScanTrigger`) records what started it, separate from `type` (`historical` /
  `realtime`). `metadata` (jsonb) holds trigger-specific data, is parsed by trigger, and is never returned raw by
  the API.
- `secret-scanning-v2-queue.ts` stays provider-agnostic. Provider behavior goes behind optional hooks on the data
  source factory (`getRealtimeScanReport` / `getScanReport` for reporting a scan back, `processEvent` for webhook
  events beyond pushes), never behind a provider check in the queue.
- PR checks are realtime scans with `trigger: pull-request`, gated on `isScanNewCommitsEnabled`. Webhook handlers
  only enqueue; `processGitHubPullRequestEvent` does the work. The check run is created before the scan, with the
  scan's ID as its `external_id`, which is how re-runs and skip actions find the scan.
- Every exit of a PR scan closes its check (including the stuck-scan reaper, which also fails realtime scans left
  `queued`), since a check left open blocks merging when it is required.
- Fork PRs aren't scanned: they get a `skipped` check under the same name, unless the commit already has one of
  our checks (checks belong to the commit, so it would replace a real result).
- Findings with the same secret value share `secretFindingBlindIndex`. Closing a finding (the PATCH routes or a GitHub
  check skip) also closes the unresolved findings in the project with that value. Close findings only through
  `closeFindingsWithSameValue` (`secret-scanning-v2-fns.ts`), including from a provider's own triage action. It writes
  the finding and its siblings together after locking them in id order; updating the finding first and its siblings
  after deadlocks two concurrent closes of the same value. A newly inserted finding inherits the newest closed triage
  for its value from `createFindingRowsBuilder`, unless that triage is `resolved`: a resolved value showing up again
  is a regression, so the finding starts `unresolved`. Keep triage columns out of the upsert's merge columns, or every
  rescan overwrites what users triaged.
