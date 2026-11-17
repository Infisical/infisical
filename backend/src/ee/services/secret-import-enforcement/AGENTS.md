# Secret import replication enforcement

The "Require approval for imported secrets" option of a secret change policy (`enforceImportReplication`, stored in
the policy's `constraints` blob, read with `readSecretChangePolicyConstraints`). When the policy that governs a folder
has it, every same-project import in that folder is a replication import, so imported values change only through
change requests. Cross-project imports are never converted and stay live.

## Two paths, and only one writes a copy directly

- **One-time rollout (this module).** Every policy create, update and delete emits
  `SecretChangePolicyModifiedEventV1` in its transaction (`emitSecretChangePolicyModified`). The
  `secret-import-enforcement-policy` consumer finds the regular same-project imports in the environments the policy
  governed before or after the change whose folder's *currently resolved* policy enforces, and emits one
  `SecretImportReplicationConversionRequestedEventV1` per import. The `secret-import-replication-conversion` consumer
  (`convertImport`) writes the copy the replication job would write, then flips the import in one transaction.
  This is the only place a first copy is written without approval. Never call it from anywhere else, never re-run it
  on a schedule, and never trigger it from a source change: a change that reaches a governed import afterwards is a
  change request.
- **Everything else (secret import service).** `createImport` forces `isReplication` when the destination enforces and
  skips the replication plan check (the policy is already plan-gated). `updateImport` makes a repointed import a
  replication import. Both queue the replication job as the caller, which opens the change request. After commit,
  `createImport` re-reads the policy from the primary, so an import that raced a policy change is still converted
  (through a change request).

## Invariants

- The copy must equal what the replication job would copy. `mergeReplicatedSecrets` mirrors the job's
  `$getReplicatedSecretsV2` precedence (source's own secrets, then its imports last to first). Change both together.
- Import positions in a folder change only under `secretImportDAL.lockFolderImportPositions` (an advisory lock), taken
  before any row lock. The reserved row goes right after its import (`insertReservedImportRow`).
- The conversion fills the reserved folder before the import points at it, so readers never see an empty copy. If the
  source changed while the copy was written, the import is marked unsuccessful with
  `SOURCE_CHANGED_DURING_CONVERSION_STATUS` instead of copying the change, so the change still needs approval
  (a resync opens the request).
- `deleteImport` removes the reserved folder whether or not the import is a replication import yet, so a conversion
  that never flipped leaves no orphan.
- Reserved folders and reserved import rows are written only by replication, change request merges and this module.
  Writers elsewhere refuse them (`assertFolderNotReserved`, `assertFolderNameNotReserved` in
  `services/secret-folder/secret-folder-reserved-fns.ts`).
- On the conversion's final outbox attempt the import stays a regular import and the failure is audited as
  `secret-import-replication-enforced` with outcome `failed`; saving the policy again is a new policy change and
  retries it.
