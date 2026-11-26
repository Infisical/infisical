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

- A finding is one secret value in one resource, and every place it was found is a row in
  `secret_scanning_finding_locations` (unique `(resourceId, fingerprint)`). Triage lives on the finding only and never
  cascades to other findings, including ones with the same value in other resources.
- Nothing in the database makes a value's finding unique, because the release before locations existed saves a
  finding per location and has to keep working after a rollback. Code that looks a value up must take the oldest
  finding when there are several.
- Scans write findings only through `findings.persistLocations` (`secret-scanning-v2-dal.ts`), in the transaction
  that records the scan's progress. Only a location the resource didn't have can create a finding or reopen a
  `resolved` one; a rescan of history must change nothing. False positives and ignored findings just gain the
  location. It takes a per-resource advisory lock (`PgSqlLock.SecretScanningFindingLocations`) first, so a diff scan
  and a full scan of one resource can't both create a finding for one value (no unique index keeps one finding per
  value, so the previous release still works after a rollback) or both take a location as new.
- Finding locks are taken in one order: a resource's advisory lock, then the project's
  (`PgSqlLock.SecretScanningFindingValues`), then finding rows `ORDER BY id FOR UPDATE`. Never take a resource's lock
  while holding the project's. `persistLocations` takes the project lock before writing anything whenever it saves a
  location with a blind index, `findings.detachResources` takes only the project lock, and PR skips take only the row
  locks. Any other write that locks several findings locks them in id order too.
- A finding's locations, not `findings.resourceId`, say which resources it is in, since a finding can have locations
  in resources other than the one it names. Filters and counts by resource or data source go through the locations. A finding with no location at all (a copy the merge by value had
  no place for) is in the resource it names.
- Deleting a resource or a data source calls `findings.detachResources` first, in the same transaction. It removes the
  resources' locations, deletes findings left without one, and points the others' deprecated columns at a location
  that stays, so the cascade through `findings.resourceId` and `findings.scanId` never deletes a finding that still
  has locations elsewhere. Never rely on that cascade.
- A fingerprint is `commit:file:rule:line:column` with the scanner's own column, and full and diff scans must build
  the same one for the same leak, or a full scan sees a known leak as a new location and reopens it.
- Findings from before blind indexes existed have a NULL blind index and one location each, and stay that way. So do
  matches without a value (rules that match only a file's path), since grouping them by value would merge them all.
- `findings.resourceId`, `scanId`, `fingerprint` and `details` describe one of the finding's locations and always move
  together, so the scan always belongs to the resource. The last three are deprecated but still written:
  `persistLocations` stores the finding's first location there, so the release before locations existed keeps working
  if a deploy is rolled back.
  The findings API still returns them (and sorts by `author` from `details`) for clients built before locations. Never
  read them in new code; drop the columns and those fields together, in a release after this one has shipped.
- Location ids of migrated findings are the old finding ids, so ids saved before the merge (a PR check's
  `findingIds`) still resolve through `findings.findByIdsOrLocationIdsForUpdate`, which only returns findings with a
  location in the check's resource.
- A PR check is judged on the finding of every location the scan matched, including locations an earlier push saved,
  never only the new ones. Its counts are distinct findings.
- Notifications are alerts on the shared alert module (`secret-scanning.data-source` provider), bound to one data
  source each: never send email or in-app notifications from this module. A scan emits `secrets-detected` or
  `scan-failed` (`secret-scanning-v2-events.ts`) with its data source as the `resourceId`, in the transaction that
  closes it, guarded on the status update matching, so a scan the reaper already closed emits nothing.
- Close a scan only through `completeFullScan`, `completeDiffScan` or `failScan` (`secret-scanning-v2-fns.ts`), never
  with a status update from the queue. It owns the closing transaction and the alert decision, so
  an alert is emitted exactly when its scan closes; the DAL keeps only the guarded transitions (`scans.markCompleted`,
  `scans.markFailed`), and the queue keeps what runs after commit (pull request check, telemetry, audit logs).
- `secrets-detected` fires only for news (`countNewUnresolvedByScanId`): unresolved findings whose value this scan
  found first in a resource, plus, for diff scans only, findings it reopened, each counted once.
  `locations.isFirstInResource` records the first, decided by value under the resource lock from the resource's
  locations, so a value already there through any finding is no news. It is NULL on locations saved by a release that
  didn't know it, and news is then the finding's `scanId`, the scan that created it; keep that column for this when
  the other rollback-only finding columns go. Never infer either from location `createdAt` (transaction start time). A
  new location of a value the resource already had was already alerted on. A resource's first full scan alerts like
  any other: don't exempt it, since a scan that found secrets and stayed silent looks broken.
- Every data source gets its alerts in the transaction that creates it: the ones its creator passed in `alerts`
  (`prepareAlertForNewResource`, which needs edit on data sources), or `SECRET_SCANNING_DEFAULT_ALERTS` when `alerts` is
  left out. Its id is chosen before that transaction so the alerts can be prepared, a KMS call, outside it. Never put
  `alerts` in an audit log as sent, since channel configs hold webhook URLs and secrets. Deleting a data source
  reaps its alerts in the delete transaction (`deleteAlertsForDeletedResource`), since alerts have no foreign key to it.
