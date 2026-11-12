# Secret scanning scans, findings and GitHub pull request checks

Read before changing scan triggers, `secret-scanning-v2-queue.ts`, findings, or the GitHub pull request check flow.

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
- A PR scan that can't finish fails its check, so an outage never lets a secret through. What GitHub's API can't
  provide (commits past the compare limit, files past the 3,000 a commit lists, a missing patch for a file over
  `MISSING_PATCH_MAX_FILE_BYTES`) is skipped and listed on the check instead, which concludes `neutral` when nothing
  else fails it, because re-running never changes those.
- Fork PRs aren't scanned: they get a `skipped` check under the same name, unless the commit already has one of
  our checks (checks belong to the commit, so it would replace a real result).

## Findings

- A finding is one secret value in one resource (unique `(resourceId, secretFindingBlindIndex)`), and every place
  it was found is a row in `secret_scanning_finding_locations` (unique `(resourceId, fingerprint)`). Triage lives on
  the finding only and never cascades to other findings, including ones with the same value in other resources.
- Scans write findings only through `findings.persistLocations` (`secret-scanning-v2-dal.ts`), in the transaction
  that records the scan's progress. Only a location the resource didn't have can create a finding or reopen a
  `resolved` one; a rescan of history must change nothing. False positives and ignored findings just gain the
  location. It upserts findings sorted by blind index so concurrent scans lock them in one order.
- A fingerprint is `commit:file:rule:line:column` with the scanner's own column, and full and diff scans must build
  the same one for the same leak, or a full scan sees a known leak as a new location and reopens it.
- Findings from before blind indexes existed have a NULL blind index and one location each, and stay that way.
- `findings.scanId`, `fingerprint` and `details` are deprecated but still written: `persistLocations` stores the
  finding's first location there, so the release before locations existed keeps working if a deploy is rolled back.
  Never read them, and drop them only in a release after this one has shipped.
- A PR check is judged on the finding of every location the scan matched, including locations an earlier push saved,
  never only the new ones. Its counts are distinct findings.
- Notifications count distinct unresolved findings with a location this scan found first (`findings.countByScanId`),
  read back from the database so a resumed full scan counts every batch.
