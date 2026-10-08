# Instance Root Encryption Key (rotation)

`ENCRYPTION_KEY` wraps the in-DB root key in `kms_root_config`, which wraps everything else. It is
rotatable, and three invariants hold that up.

**The sentinel row always holds the active key.** `kms_root_config` can hold up to three rows, but
`KMS_ROOT_CONFIG_UUID` is always the current one. That id is no longer "the config row", it is a
compatibility handle: an app version predating rotation looks the row up by id and knows nothing about
staged keys or retained copies, so keeping the active key there is what lets such a version boot. New
code never looks rows up by id — it **trial-decrypts** in a fixed order (sentinel, staged, retained), so
`kekLabel` is never a lookup key. It exists on both tables purely as a human label, derived from the key so
an operator can recompute it and match an archived key to a backup; nothing resolves a row by it.

**A rotation is inert until a pod boots with the new key.** `POST /admin/encryption/root-key/rotations` writes
a *staged* row and does not touch the sentinel, so generating a key changes nothing and discarding it is a row
delete. `$resolveRootKey` promotes it on the first boot that decrypts it: the sentinel takes the new
ciphertext, the old one moves to a retained copy, and **every** staged row is dropped (an abandoned staged
row is a live working key, so a replaced staged key left in someone's clipboard must not be able to promote
itself later). There is no rollback after promotion, only the retention window during which the old key still
boots.

**The legacy tier is pinned, not rotated.** `project_bots`, `user_encryption_keys.serverEncryptedPrivateKey`,
`secret_blind_indexes` and `org_bots` encrypt straight from the env var. `kms_legacy_encryption_keys` snapshots
those env values under the root key at boot, and `crypto.ts` / `encryption.ts` read the snapshot instead of
`process.env`, which is what decouples that tier from the environment. The snapshot holds **both** the
post-FIPS-relabel values (used for writes, so ciphertext is unchanged) and the pre-relabel ones (tried on
decrypt, because the relabel at `env.ts:746-748` overwrites its target unconditionally). That tier
is never rotated; `infisical.legacy_root_key.usage` is the evidence for when it can be deleted.

Consequences worth knowing:

- **A migration must never call `*WithRootEncryptionKey` or `buildSecretBlindIndexFromName`.** Migrations run
  before `kmsService.startService`, so they cannot reach the snapshot and fall back to `process.env`, which on
  a rotated instance is the wrong key: decrypts fail the auth tag, encrypts silently write unreadable rows.
  ESLint blocks this under `src/db/migrations/`; the pre-existing call sites carry a file-level disable
  explaining why they are safe.
- **Exactly one retained key survives a promotion, enforced at promotion, not by the GC.** A second
  rotation before the first was completed would otherwise leave an older wrapper of the root key that
  `getRootKey` never reports (it returns only the newest), so an operator removing "the previous key" is
  told the rotation is finished while a leaked older `ENCRYPTION_KEY` still opens the database. The cost is that an
  instance two rotations behind cannot restart; staging a key warns about that and deliberately does not
  block, since an operator responding to a leak has to be able to rotate again immediately.
- **`updateEncryptionStrategy` refuses while a rotation is in flight.** A switch to HSM would not otherwise be
  enforced, since a pod with the old env key would still trial-decrypt a retained software copy and boot
  without touching the device.
- **`lastResolvedAt` can prove presence, never absence.** An instance stamps it at boot only when it resolves a
  *superseded* row, which is positive evidence a straggler still holds that key and makes both the
  expiring-key delete and the GC decline. An instance that never restarts never stamps, so the retention window is what covers it.
  That is the deliberate limit: getting it wrong costs an instance that fails its next restart with an error
  naming the key it needs, not lost data.
