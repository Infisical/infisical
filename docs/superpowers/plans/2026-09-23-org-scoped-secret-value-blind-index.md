# Org-scoped secret value blind index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a second blind index on every secret value, keyed by the org's KMS data key instead of the project's, so a later change can answer "is this value used anywhere in this organization".

**Architecture:** `secrets_v2.secretValueBlindIndex` is an HMAC keyed by the project's SecretManager data key, so two projects holding the same value produce different digests. We add `secretValueOrgBlindIndex` alongside it, derived the same way from the org's data key, written on every create and update exactly as the project digest already is. An org-level flag suppresses the write for customers who do not want org-wide fingerprinting. This plan ships the write only. No backfill, and nothing reads the column.

**Tech Stack:** TypeScript, Fastify 4, Knex migrations, Zod schemas generated from the database, Vitest (unit and in-process e2e), BullMQ.

**Spec:** Notion, "Design spec: org-scoped secret value blind index" (https://app.notion.com/p/3e45646922298179a5fdd31fc97317cc), child of "Org-wide secret value search and uniqueness" (https://app.notion.com/p/3e45646922298171bf31cc0eea4c4bba).

**Tickets:** SECRETS-512 owns enablement across projects and has PR #8100 open. This work sits underneath ENG-5715 (duplicates in product-level insights), ENG-5716 (search every project for a known value), and SECRETS-701 (block org-wide reuse).

## Global Constraints

- Read [`backend/CODE_QUALITY.md`](../../../backend/CODE_QUALITY.md) before and after every backend task in this plan.
- Never open a nested `transaction()`. Every DAL call inside a `transaction()` callback passes `tx`, reads included. A helper that touches the database and can be called from inside a transaction accepts `tx?: Knex` and forwards it.
- No expensive CPU work and no network calls between `BEGIN` and `COMMIT`. Building a cipher pair can hit an external KMS, so cipher pairs are built before the transaction opens, never per secret inside one.
- `DB_POOL_MAX` defaults to 10 connections per instance. A missed `tx` costs a second connection on the same request.
- Run `cd backend && npm run generate:schema` after any migration that changes a table, and commit the regenerated Zod schemas.
- Run `make reviewable-api` before finishing. It runs lint:fix and type:check.
- Comments default to none. One earns its place only by explaining why: a non-obvious constraint, a workaround, an ordering dependency. No narration, no change history, no ticket references.
- Never interpolate a secret value, a digest, or key material into a log line or an error message.
- The org flag defaults to enabled, so the digest is written for every org that has not opted out. The flag must land in the same release as the write.

## Review Focus

Five things the spec implies that no single task's happy path exercises. Each has a test pinned to the task that owns the code.

- A secret with no value (`encryptedValue` null) must get a null org digest rather than an HMAC of an empty buffer, or every valueless secret in an org collides on one digest. Covered in Task 2.
- An org that has opted out must have no org digest anywhere, including on `secret_versions_v2`, since the version table is what a rollback restores from. Covered in Task 3 and Task 7.
- A folder rollback copies the digest off a version row back onto the secret. If the version row lacks the org digest, the rollback nulls it on a live secret and that secret silently drops out of any future org-level answer. Covered in Task 6.
- An org that has never used its KMS data key gets one created lazily under an advisory lock. The first write for such an org must not fail or deadlock. Covered in Task 2.
- A bulk write of thousands of secrets now runs two HMACs per value instead of one. If the org cipher pair is built per secret rather than per request, that is thousands of KMS resolutions inside a request. Covered in Task 2.

---

## File Structure

Created:

- `backend/src/db/migrations/20260923120000_add-secret-value-org-blind-index.ts` — the two columns, the partial index, and the org flag.
- `backend/src/services/secret-v2-bridge/secret-blind-index-fns.ts` — the indexer factory. Resolves the org flag once, builds both cipher pairs once, and returns a function that turns a plaintext buffer into both digests.
- `backend/src/services/secret-v2-bridge/secret-blind-index-fns.test.ts` — unit tests for the indexer.
- `backend/e2e-test/secret-value-org-blind-index.spec.ts` — end-to-end proof that writes populate both columns and that an opted-out org gets only the project digest.

Modified:

- `backend/src/db/schemas/secrets-v2.ts`, `backend/src/db/schemas/secret-versions-v2.ts`, `backend/src/db/schemas/organizations.ts` — regenerated, not hand-edited.
- `backend/src/services/secret-v2-bridge/secret-v2-bridge-types.ts` — the insert and update input types.
- `backend/src/services/secret-v2-bridge/secret-v2-bridge-fns.ts` — the two bulk funnels and the direct `updateById` writers.
- `backend/src/services/secret-v2-bridge/secret-v2-bridge-service.ts` — create, update, and bulk call sites.
- `backend/src/ee/services/secret-approval-request/secret-approval-request-service.ts`, `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-service.ts`, `backend/src/ee/services/honey-token/honey-token-service.ts` — EE writers.
- `backend/src/services/secret/secret-fns.ts`, `backend/src/services/external-migration/external-migration-fns/import.ts`, `backend/src/services/folder-commit/folder-commit-service.ts`, `backend/src/services/project/project-queue.ts` — remaining writers.
- `backend/src/server/routes/sanitizedSchemas.ts` — expose the org flag on the sanitized org shape.

The ordering below keeps every task in a compiling, testable state. The org field stays optional until Task 8, which flips it to required so the compiler proves nothing was missed.

---

### Task 1: Schema

**Files:**
- Create: `backend/src/db/migrations/20260923120000_add-secret-value-org-blind-index.ts`
- Modify: `backend/src/db/schemas/secrets-v2.ts`, `backend/src/db/schemas/secret-versions-v2.ts`, `backend/src/db/schemas/organizations.ts` (regenerated)
- Modify: `backend/src/server/routes/sanitizedSchemas.ts:340` area

**Interfaces:**
- Consumes: nothing.
- Produces: `secrets_v2.secretValueOrgBlindIndex`, `secret_versions_v2.secretValueOrgBlindIndex`, `organizations.secretValueOrgBlindIndexEnabled`, and the regenerated `TSecretsV2Insert`, `TSecretVersionsV2Insert`, `TOrganizations` types.

- [ ] **Step 1: Write the migration**

The column migration and the index migration are separate files upstream because `CREATE INDEX CONCURRENTLY` cannot run inside a transaction. Knex runs each migration file in its own transaction unless the file exports `config = { transaction: false }`, so both halves go in one file here only if that export is present. Keep them in one file with the export.

```typescript
import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueOrgBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        // 64 chars = 32 bytes hex encoded (HMAC-SHA256 output)
        t.string("secretValueOrgBlindIndex", 64).nullable();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueOrgBlindIndex");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.string("secretValueOrgBlindIndex", 64).nullable();
      });
    }
  }

  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "secretValueOrgBlindIndexEnabled");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.boolean("secretValueOrgBlindIndexEnabled").defaultTo(true).notNullable();
      });
    }
  }

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_secrets_v2_secret_value_org_blind_index
    ON ${TableName.SecretV2} ("secretValueOrgBlindIndex")
    WHERE "secretValueOrgBlindIndex" IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_secrets_v2_secret_value_org_blind_index`);

  if (await knex.schema.hasTable(TableName.SecretV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretV2, "secretValueOrgBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretV2, (t) => {
        t.dropColumn("secretValueOrgBlindIndex");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.SecretVersionV2)) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretVersionV2, "secretValueOrgBlindIndex");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
        t.dropColumn("secretValueOrgBlindIndex");
      });
    }
  }

  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasColumn = await knex.schema.hasColumn(TableName.Organization, "secretValueOrgBlindIndexEnabled");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.Organization, (t) => {
        t.dropColumn("secretValueOrgBlindIndexEnabled");
      });
    }
  }
}

// CONCURRENTLY requires running outside a transaction
const config = { transaction: false };
export { config };
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npm run migration:latest`
Expected: the migration applies with no error. If it fails partway, `CREATE INDEX CONCURRENTLY` can leave an invalid index behind; drop it by name before retrying.

- [ ] **Step 3: Regenerate the Zod schemas**

Run: `cd backend && npm run generate:schema`
Expected: `secretValueOrgBlindIndex` appears on `SecretsV2Schema` and `SecretVersionsV2Schema`, and `secretValueOrgBlindIndexEnabled` on `OrganizationsSchema`. Do not hand-edit these files; they carry a generated-code header.

- [ ] **Step 4: Expose the org flag on the sanitized org shape**

In `backend/src/server/routes/sanitizedSchemas.ts`, find the org pick that already lists `secretBlindIndexEnabled` and add the new key beside it so the org settings API can read it back:

```typescript
  secretValueOrgBlindIndexEnabled: true,
```

- [ ] **Step 5: Verify the index exists and is valid**

Run: `cd backend && psql "$DB_CONNECTION_URI" -c "\d secrets_v2"`
Expected: `idx_secrets_v2_secret_value_org_blind_index` is listed and is not marked INVALID.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/migrations/20260923120000_add-secret-value-org-blind-index.ts backend/src/db/schemas backend/src/server/routes/sanitizedSchemas.ts
git commit -m "feat(blind-index): add org-scoped secret value blind index columns"
```

---

### Task 2: The indexer

**Files:**
- Create: `backend/src/services/secret-v2-bridge/secret-blind-index-fns.ts`
- Create: `backend/src/services/secret-v2-bridge/secret-blind-index-fns.test.ts`

**Interfaces:**
- Consumes: `kmsService.createCipherPairWithDataKey` and `orgDAL.findById` from Task 1's regenerated org type.
- Produces:
  - `type TSecretValueBlindIndexes = { secretValueBlindIndex: string; secretValueOrgBlindIndex: string | null }`
  - `createSecretBlindIndexer(arg: TCreateSecretBlindIndexerDTO): Promise<TSecretBlindIndexer>`
  - `type TSecretBlindIndexer = { generate: (secretValue: Buffer) => Promise<TSecretValueBlindIndexes>; generateOptional: (secretValue?: string | null) => Promise<TSecretValueBlindIndexes | null> }`

The factory resolves the org flag and builds both cipher pairs once. Callers build one indexer per request and reuse it across every secret in the request. That matters: a bulk write can carry thousands of values, and building a cipher pair per value would resolve the KMS key thousands of times, possibly over the network for an org on external KMS.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/services/secret-v2-bridge/secret-blind-index-fns.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { KmsDataKey } from "@app/services/kms/kms-types";

import { createSecretBlindIndexer } from "./secret-blind-index-fns";

const PROJECT_ID = "6c1b0e3a-0e3a-4c1b-8e3a-0e3a4c1b8e3a";
const ORG_ID = "9d2c1f4b-1f4b-4d2c-9f4b-1f4b4d2c9f4b";

const makeKmsService = () => ({
  createCipherPairWithDataKey: vi.fn(async (ctx: { type: KmsDataKey }) => ({
    generateSecretBlindIndex: async (value: Buffer) =>
      `${ctx.type === KmsDataKey.Organization ? "org" : "project"}:${value.toString()}`
  }))
});

const makeOrgDAL = (secretValueOrgBlindIndexEnabled: boolean) => ({
  findById: vi.fn(async () => ({ id: ORG_ID, secretValueOrgBlindIndexEnabled }))
});

describe("createSecretBlindIndexer", () => {
  it("returns both digests when the org has the index enabled", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await expect(indexer.generate(Buffer.from("hunter2"))).resolves.toEqual({
      secretValueBlindIndex: "project:hunter2",
      secretValueOrgBlindIndex: "org:hunter2"
    });
  });

  it("returns a null org digest when the org has opted out", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(false) as never
    });

    await expect(indexer.generate(Buffer.from("hunter2"))).resolves.toEqual({
      secretValueBlindIndex: "project:hunter2",
      secretValueOrgBlindIndex: null
    });
  });

  it("does not resolve the org data key at all when the org has opted out", async () => {
    const kmsService = makeKmsService();

    await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: kmsService as never,
      orgDAL: makeOrgDAL(false) as never
    });

    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledTimes(1);
    expect(kmsService.createCipherPairWithDataKey).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: KmsDataKey.Organization }),
      expect.anything()
    );
  });

  it("builds each cipher pair once no matter how many values it indexes", async () => {
    const kmsService = makeKmsService();
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: kmsService as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await Promise.all(["a", "b", "c", "d"].map((value) => indexer.generate(Buffer.from(value))));

    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledTimes(2);
  });

  it("returns null for a secret with no value rather than hashing an empty buffer", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await expect(indexer.generateOptional(undefined)).resolves.toBeNull();
    await expect(indexer.generateOptional(null)).resolves.toBeNull();
  });

  it("indexes the empty string when it is an actual value", async () => {
    const indexer = await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: makeKmsService() as never,
      orgDAL: makeOrgDAL(true) as never
    });

    await expect(indexer.generateOptional("")).resolves.toEqual({
      secretValueBlindIndex: "project:",
      secretValueOrgBlindIndex: "org:"
    });
  });

  it("threads the transaction into both the org lookup and the key resolution", async () => {
    const kmsService = makeKmsService();
    const orgDAL = makeOrgDAL(true);
    const tx = { marker: "tx" };

    await createSecretBlindIndexer({
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      kmsService: kmsService as never,
      orgDAL: orgDAL as never,
      tx: tx as never
    });

    expect(orgDAL.findById).toHaveBeenCalledWith(ORG_ID, tx);
    expect(kmsService.createCipherPairWithDataKey).toHaveBeenCalledWith(expect.anything(), tx);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/services/secret-v2-bridge/secret-blind-index-fns.test.ts`
Expected: FAIL, cannot resolve `./secret-blind-index-fns`.

- [ ] **Step 3: Write the indexer**

Create `backend/src/services/secret-v2-bridge/secret-blind-index-fns.ts`:

```typescript
import { Knex } from "knex";

import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

export type TSecretValueBlindIndexes = {
  secretValueBlindIndex: string;
  secretValueOrgBlindIndex: string | null;
};

export type TSecretBlindIndexer = {
  generate: (secretValue: Buffer) => Promise<TSecretValueBlindIndexes>;
  generateOptional: (secretValue?: string | null) => Promise<TSecretValueBlindIndexes | null>;
};

export type TCreateSecretBlindIndexerDTO = {
  projectId: string;
  orgId: string;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  tx?: Knex;
};

export const createSecretBlindIndexer = async ({
  projectId,
  orgId,
  kmsService,
  orgDAL,
  tx
}: TCreateSecretBlindIndexerDTO): Promise<TSecretBlindIndexer> => {
  const [projectCipher, org] = await Promise.all([
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId }, tx),
    orgDAL.findById(orgId, tx)
  ]);

  const orgCipher = org?.secretValueOrgBlindIndexEnabled
    ? await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId }, tx)
    : null;

  const generate = async (secretValue: Buffer): Promise<TSecretValueBlindIndexes> => {
    const [secretValueBlindIndex, secretValueOrgBlindIndex] = await Promise.all([
      projectCipher.generateSecretBlindIndex(secretValue),
      orgCipher ? orgCipher.generateSecretBlindIndex(secretValue) : Promise.resolve(null)
    ]);

    return { secretValueBlindIndex, secretValueOrgBlindIndex };
  };

  return {
    generate,
    generateOptional: async (secretValue?: string | null) =>
      secretValue === undefined || secretValue === null ? null : generate(Buffer.from(secretValue))
  };
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/services/secret-v2-bridge/secret-blind-index-fns.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Let a failed key resolution throw**

Do not wrap `createCipherPairWithDataKey` in a try/catch that falls back to a null org digest. The spec suggested degrading so that a feature nothing consumes yet cannot fail a secret write, and that is the wrong call while no backfill exists: a silently missing digest never self-heals and nothing detects it, so the org-level answer is quietly wrong forever. Failing loudly is recoverable, a silent gap is not. Raise this with Calvin if you disagree before changing it.

The error a caller sees still has to be usable, so if the throw surfaces raw KMS vocabulary, wrap it per `CODE_QUALITY.md`:

```typescript
throw new BadRequestError({
  message: `Organization '${orgId}' has no usable encryption key. Contact support if this persists.`
});
```

- [ ] **Step 6: Type check**

Run: `cd backend && npm run type:check`
Expected: no errors. If `createCipherPairWithDataKey` does not accept a second `tx` argument in the current signature, add it there rather than dropping the argument here; `$getDataKey` already threads a `trx` through.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/secret-v2-bridge/secret-blind-index-fns.ts backend/src/services/secret-v2-bridge/secret-blind-index-fns.test.ts
git commit -m "feat(blind-index): add org-scoped secret blind indexer"
```

---

### Task 3: Carry the org digest through the bulk funnels

**Files:**
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-types.ts:188-235`
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-fns.ts:59-140` (`fnSecretBulkInsert`), and the `fnSecretBulkUpdate` body below it

**Interfaces:**
- Consumes: `TSecretValueBlindIndexes` from Task 2.
- Produces: `TFnSecretBulkInsert` and `TFnSecretBulkUpdate` accept an optional `secretValueOrgBlindIndex?: string | null` alongside the existing `secretValueBlindIndex`, and both write it to `secrets_v2` and `secret_versions_v2`.

Optional at this stage so the tree keeps compiling while the call sites convert. Task 8 makes it required.

- [ ] **Step 1: Widen the input types**

In `backend/src/services/secret-v2-bridge/secret-v2-bridge-types.ts`, add the field everywhere `secretValueBlindIndex` appears in these two types. In `TFnSecretBulkInsert`:

```typescript
  inputSecrets: Array<
    Omit<TSecretsV2Insert, "folderId" | "metadata"> & {
      tagIds?: string[];
      references: TSecretReference[];
      secretMetadata?: { key: string; value?: string | null; encryptedValue?: Buffer | null }[];
      parentSecretVersionId?: string;
      secretValueBlindIndex?: string | null;
      secretValueOrgBlindIndex?: string | null;
    }
  >;
```

and in both arms of `TRequireReferenceIfValue`:

```typescript
type TRequireReferenceIfValue =
  | (Omit<TSecretsV2Update, "encryptedValue" | "metadata"> & {
      encryptedValue: Buffer | null;
      references: TSecretReference[];
      secretValueBlindIndex?: string | null;
      secretValueOrgBlindIndex?: string | null;
    })
  | (Omit<TSecretsV2Update, "encryptedValue" | "metadata"> & {
      encryptedValue?: never;
      references?: never;
      secretValueBlindIndex?: never;
      secretValueOrgBlindIndex?: never;
    });
```

- [ ] **Step 2: Carry it through `fnSecretBulkInsert`**

In `backend/src/services/secret-v2-bridge/secret-v2-bridge-fns.ts`, `sanitizedInputSecrets` destructures each field by name and rebuilds the row. Add the new field to both halves:

```typescript
  const sanitizedInputSecrets = inputSecrets.map(
    ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      reminderNote,
      encryptedValue,
      reminderRepeatDays,
      secretValueBlindIndex,
      secretValueOrgBlindIndex
    }) => ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      reminderNote,
      encryptedValue,
      reminderRepeatDays,
      secretValueBlindIndex,
      secretValueOrgBlindIndex
    })
  );
```

`versionData` below it spreads `...el` off `sanitizedInputSecrets`, so the version rows pick the field up from this one edit. Do not add it separately there.

- [ ] **Step 3: Carry it through `fnSecretBulkUpdate`**

This one needs two edits rather than one, because unlike the insert path its `versionData` is built from the rows `bulkUpdate` returns rather than from `sanitizedInputSecrets`, and it destructures each field by name.

First the update payload:

```typescript
  const sanitizedInputSecrets = inputSecrets.map(
    ({
      filter,
      data: {
        skipMultilineEncoding,
        type,
        key,
        encryptedValue,
        userId,
        encryptedComment,
        secretValueBlindIndex,
        secretValueOrgBlindIndex
      }
    }) => ({
      filter: { ...filter, folderId },
      data: {
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        encryptedValue,
        secretValueBlindIndex,
        secretValueOrgBlindIndex
      }
    })
  );
```

Then the version rows, where `secretValueOrgBlindIndex` goes into both the destructure off `newSecrets` and the object being built:

```typescript
  const versionData = newSecrets.map(
    (
      {
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        version,
        encryptedValue,
        secretValueBlindIndex,
        secretValueOrgBlindIndex,
        id: secretId
      },
      index
    ) => ({
      // ...unchanged fields...
      secretValueBlindIndex,
      secretValueOrgBlindIndex,
      folderId,
      secretId,
      userActorId,
      identityActorId,
      actorType,
      parentVersionId: inputSecrets?.[index]?.data?.parentSecretVersionId
    })
  );
```

Missing the second edit is the quiet failure: the secret row gets the org digest and its version row does not, and a later rollback then nulls the digest on a live secret.

- [ ] **Step 4: Prove both tables receive the column**

Run: `cd backend && make test-api-e2e SPEC=insights-static-secret-usage`
Expected: PASS. This suite writes secrets through the bulk funnel, so it is the cheapest existing check that the widened types did not break the write path. It does not yet assert the new column; Task 7 does that.

- [ ] **Step 5: Type check**

Run: `cd backend && npm run type:check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/secret-v2-bridge/secret-v2-bridge-types.ts backend/src/services/secret-v2-bridge/secret-v2-bridge-fns.ts
git commit -m "feat(blind-index): carry org blind index through bulk secret writes"
```

---

### Task 4: Convert the bridge service and bridge fns call sites

**Files:**
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-service.ts` at the `generateSecretBlindIndex` call sites (lines 477, 779, 2311, 2710, 2790 as of this writing) and the explicit null at 3962
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-fns.ts` at lines 803, 847, 1002, 1070, 1124, 1205, 1250, 1796, 1839

**Interfaces:**
- Consumes: `createSecretBlindIndexer` from Task 2, the widened types from Task 3.
- Produces: every secret written through the bridge carries both digests.

Line numbers move as you edit. Find the sites with `grep -n "generateSecretBlindIndex\|secretValueBlindIndex" backend/src/services/secret-v2-bridge/*.ts` and work the list, rather than trusting the numbers above.

- [ ] **Step 1: Build one indexer per service call**

Each of these functions already calls `kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId })` for `encryptor` and `decryptor`, and destructures `generateSecretBlindIndex` off it. Keep that call for the cipher, and add the indexer beside it. The indexer is built once, before any transaction opens:

```typescript
    const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
      await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

    const blindIndexer = await createSecretBlindIndexer({
      projectId,
      orgId: actorOrgId,
      kmsService,
      orgDAL
    });
```

`orgDAL` is already a dependency of `secretV2BridgeServiceFactory`, but narrowed to `Pick<TOrgDALFactory, "findOrgById">` at `secret-v2-bridge-types.ts:190`. Widen it:

```typescript
  orgDAL: Pick<TOrgDALFactory, "findOrgById" | "findById">;
```

Use `findById`, not `findOrgById`. `findOrgById` takes no `tx`, goes straight to `db.replicaNode()`, and joins SAML config it does not need here. A call with no `tx` checks out a second connection, which is the deadlock trigger the Global Constraints name. `findById` is the ormify method and takes `(id, tx)`.

- [ ] **Step 2: Replace the single-digest call sites**

A site that reads like this:

```typescript
            secretValueBlindIndex: await generateSecretBlindIndex(Buffer.from(secretValue))
```

becomes:

```typescript
            ...(await blindIndexer.generate(Buffer.from(secretValue)))
```

A site that guards on the value being present, like `secret-v2-bridge-service.ts:477`:

```typescript
    const secretValueBlindIndex = inputSecretData.secretValue
      ? await generateSecretBlindIndex(Buffer.from(inputSecretData.secretValue))
      : undefined;
```

becomes:

```typescript
    const blindIndexes = await blindIndexer.generateOptional(inputSecretData.secretValue);
```

and the object literal that consumed `secretValueBlindIndex` spreads instead:

```typescript
            ...blindIndexes,
```

Spreading `null` is a no-op in an object literal, so a valueless secret leaves both columns unset, which matches today's behavior for the project column.

- [ ] **Step 3: Replace the direct `updateById` writers in bridge fns**

The five sites in `secret-v2-bridge-fns.ts` that write straight to the DAL look like this:

```typescript
      const newBlindIndex = await generateSecretBlindIndex(newValueBuffer);

      const updatedSecret = await secretDAL.updateById(
        secretToUpdate.id,
        { encryptedValue: newEncryptedValue, secretValueBlindIndex: newBlindIndex, $incr: { version: 1 } },
        tx
      );
```

become:

```typescript
      const newBlindIndexes = await blindIndexer.generate(newValueBuffer);

      const updatedSecret = await secretDAL.updateById(
        secretToUpdate.id,
        { encryptedValue: newEncryptedValue, ...newBlindIndexes, $incr: { version: 1 } },
        tx
      );
```

These functions receive `generateSecretBlindIndex` as a parameter today (see `TFnUpdateSecretLinkedReferences`). Replace that parameter with `blindIndexer: TSecretBlindIndexer` and update every caller to pass the indexer it already built. The version-row insert a few lines below each of these also sets `secretValueBlindIndex`; spread `newBlindIndexes` there too.

- [ ] **Step 4: Leave the explicit null alone**

`secret-v2-bridge-service.ts:3962` sets `secretValueBlindIndex: null` deliberately. Add `secretValueOrgBlindIndex: null` beside it so the two stay consistent, and read the surrounding function to confirm null is still correct there rather than changing the behavior.

- [ ] **Step 5: Type check and run the bridge tests**

Run: `cd backend && npm run type:check && npx vitest run src/services/secret-v2-bridge`
Expected: no type errors, existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/secret-v2-bridge backend/src/server/routes/index.ts
git commit -m "feat(blind-index): write org blind index from the secret bridge"
```

---

### Task 5: Convert the EE writers

**Files:**
- Modify: `backend/src/ee/services/secret-approval-request/secret-approval-request-service.ts:889, 975, 995, 1068, 1097, 1116, 1185`
- Modify: `backend/src/ee/services/secret-rotation-v2/secret-rotation-v2-service.ts:691, 702, 1101, 1201, 1375, 2105`
- Modify: `backend/src/ee/services/honey-token/honey-token-service.ts:324, 381, 528, 565`

**Interfaces:**
- Consumes: `createSecretBlindIndexer` and `TSecretBlindIndexer` from Task 2.
- Produces: approval merges, rotations, and honey tokens all write both digests.

- [ ] **Step 1: Convert the approval request service**

This service computes digests in two batches, `creationBlindIndexes` and `updationBlindIndexes`, then indexes into them positionally. Build the indexer where it currently destructures `generateSecretBlindIndex` off the cipher pair, and change the batch to produce pairs:

```typescript
    const creationBlindIndexes = await Promise.all(
      secretCreationCommits.map((el) =>
        el.encryptedValue
          ? blindIndexer.generate(secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }))
          : Promise.resolve(null)
      )
    );
```

and the consumer at the insert:

```typescript
                  ...creationBlindIndexes[idx],
```

Apply the same shape to `updationBlindIndexes`. Keep the positional indexing; changing it is out of scope here.

- [ ] **Step 2: Convert the rotation service**

All three rotation sites follow the single-value pattern from Task 4 Step 2. The rotation service builds its cipher pair inside `kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId })` at lines 691 and 1101; add the indexer beside each, and replace:

```typescript
              secretValueBlindIndex: await generateSecretBlindIndex(Buffer.from(value)),
```

with:

```typescript
              ...(await blindIndexer.generate(Buffer.from(value))),
```

Line 2105 hashes `passwordBuffer` rather than `Buffer.from(value)`; the replacement is the same with that buffer.

- [ ] **Step 3: Convert the honey token service**

Two sites, same single-value pattern. Note line 565 renames the destructured function to `generateBlindIndex`; name the indexer consistently rather than preserving the alias.

- [ ] **Step 4: Type check and run the EE tests**

Run: `cd backend && npm run type:check && npx vitest run src/ee/services`
Expected: no type errors, existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ee/services
git commit -m "feat(blind-index): write org blind index from approvals, rotations and honey tokens"
```

---

### Task 6: Convert the remaining writers

**Files:**
- Modify: `backend/src/services/secret/secret-fns.ts:838, 1050`
- Modify: `backend/src/services/external-migration/external-migration-fns/import.ts:321-336`
- Modify: `backend/src/services/folder-commit/folder-commit-service.ts:1067, 1104, 1146, 1184`
- Modify: `backend/src/services/project/project-queue.ts:705-716`

**Interfaces:**
- Consumes: `createSecretBlindIndexer` from Task 2.
- Produces: the v1 secret service, external import, folder rollback, and the existing project backfill all carry the org digest.

- [ ] **Step 1: Convert `secret-fns.ts` and `import.ts`**

Both follow the single-value pattern from Task 4. `import.ts` guards on `el.secretValue`, so use `generateOptional` and spread.

- [ ] **Step 2: Carry both digests through folder rollback**

`folder-commit-service.ts` copies the digest off a version row rather than computing it. Each of the four sites reads like:

```typescript
                secretValueBlindIndex: secretVersion.secretValueBlindIndex
```

and becomes:

```typescript
                secretValueBlindIndex: secretVersion.secretValueBlindIndex,
                secretValueOrgBlindIndex: secretVersion.secretValueOrgBlindIndex
```

This is the site the Review Focus calls out. If it is missed, a rollback writes the old project digest and leaves the org digest null on a live secret, and that secret silently disappears from any future org-level answer.

- [ ] **Step 3: Write the failing rollback test**

Add to `backend/e2e-test/secret-value-org-blind-index.spec.ts` (created in Task 7; if running tasks out of order, create the file here):

```typescript
  test("a folder rollback restores both blind indexes", async () => {
    const created = await createSecret({ key: "ROLLBACK_ME", value: "first-value" });
    const before = await getSecretRow(created.id);
    expect(before.secretValueOrgBlindIndex).toEqual(expect.any(String));

    await updateSecret({ id: created.id, value: "second-value" });
    await rollbackFolderToCommit({ folderId: created.folderId, commitId: before.commitId });

    const after = await getSecretRow(created.id);
    expect(after.secretValueBlindIndex).toBe(before.secretValueBlindIndex);
    expect(after.secretValueOrgBlindIndex).toBe(before.secretValueOrgBlindIndex);
  });
```

- [ ] **Step 4: Run it to verify it fails before the fix and passes after**

Run: `cd backend && make test-api-e2e SPEC=secret-value-org-blind-index`
Expected: with Step 2 reverted, FAIL on `after.secretValueOrgBlindIndex` being null. With Step 2 applied, PASS.

- [ ] **Step 5: Extend the existing project backfill**

`project-queue.ts` backfills the project digest for older projects. It already decrypts each value, so adding the org digest is nearly free and saves a second pass over the same rows later. Replace the update shape:

```typescript
      const updates: { id: string; secretValueBlindIndex: string; secretValueOrgBlindIndex: string | null }[] = [];
      for (const secret of secrets) {
        if (secret.encryptedValue) {
          const decryptedValue = decryptor({ cipherTextBlob: secret.encryptedValue });
          const blindIndexes = await blindIndexer.generate(decryptedValue);
          updates.push({ id: secret.id, ...blindIndexes });
        }
      }
```

and widen `batchSetBlindIndexes` in `secret-v2-bridge-dal.ts:1286` to accept and write the new column. Build the indexer once outside the batch loop, next to where the job builds its cipher pair.

This does not make the job an org backfill. It still only runs for projects that opt into project-level indexing, and it only covers `secrets_v2`. The org backfill is separate work.

- [ ] **Step 6: Type check and commit**

Run: `cd backend && npm run type:check`

```bash
git add backend/src/services/secret backend/src/services/external-migration backend/src/services/folder-commit backend/src/services/project backend/src/services/secret-v2-bridge/secret-v2-bridge-dal.ts backend/e2e-test/secret-value-org-blind-index.spec.ts
git commit -m "feat(blind-index): write org blind index from import, rollback and backfill"
```

---

### Task 7: End-to-end proof

**Files:**
- Create or extend: `backend/e2e-test/secret-value-org-blind-index.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing other tasks depend on.

Model the setup on `backend/e2e-test/insights-static-secret-usage.spec.ts`, which already seeds a project and writes secrets through the real service.

- [ ] **Step 1: Write the failing tests**

```typescript
  test("the same value in two projects in one org gets the same org digest and different project digests", async () => {
    const a = await createSecretInProject(projectA.id, { key: "SHARED", value: "same-value" });
    const b = await createSecretInProject(projectB.id, { key: "SHARED", value: "same-value" });

    const [rowA, rowB] = await Promise.all([getSecretRow(a.id), getSecretRow(b.id)]);

    expect(rowA.secretValueOrgBlindIndex).toBe(rowB.secretValueOrgBlindIndex);
    expect(rowA.secretValueBlindIndex).not.toBe(rowB.secretValueBlindIndex);
  });

  test("the same value in two different orgs gets different org digests", async () => {
    const a = await createSecretInProject(projectA.id, { key: "SHARED", value: "same-value" });
    const other = await createSecretInProject(otherOrgProject.id, { key: "SHARED", value: "same-value" });

    const [rowA, rowOther] = await Promise.all([getSecretRow(a.id), getSecretRow(other.id)]);

    expect(rowA.secretValueOrgBlindIndex).not.toBe(rowOther.secretValueOrgBlindIndex);
  });

  test("an org that has opted out gets no org digest on the secret or its version", async () => {
    await setOrgFlag(optedOutOrg.id, { secretValueOrgBlindIndexEnabled: false });

    const secret = await createSecretInProject(optedOutProject.id, { key: "NO_FINGERPRINT", value: "v" });

    const [row, version] = await Promise.all([getSecretRow(secret.id), getLatestVersionRow(secret.id)]);

    expect(row.secretValueBlindIndex).toEqual(expect.any(String));
    expect(row.secretValueOrgBlindIndex).toBeNull();
    expect(version.secretValueOrgBlindIndex).toBeNull();
  });

  test("an update rewrites both digests", async () => {
    const secret = await createSecretInProject(projectA.id, { key: "ROTATES", value: "before" });
    const before = await getSecretRow(secret.id);

    await updateSecretInProject(projectA.id, { id: secret.id, value: "after" });
    const after = await getSecretRow(secret.id);

    expect(after.secretValueBlindIndex).not.toBe(before.secretValueBlindIndex);
    expect(after.secretValueOrgBlindIndex).not.toBe(before.secretValueOrgBlindIndex);
  });

  test("a secret with no value has neither digest", async () => {
    const secret = await createSecretInProject(projectA.id, { key: "EMPTY", value: undefined });
    const row = await getSecretRow(secret.id);

    expect(row.secretValueBlindIndex).toBeNull();
    expect(row.secretValueOrgBlindIndex).toBeNull();
  });

  test("an org with no KMS data key yet gets one created on its first secret write", async () => {
    const fresh = await createOrgWithoutKmsDataKey();
    const project = await createProjectInOrg(fresh.id);

    const secret = await createSecretInProject(project.id, { key: "FIRST", value: "v" });
    const row = await getSecretRow(secret.id);

    expect(row.secretValueOrgBlindIndex).toEqual(expect.any(String));
  });
```

- [ ] **Step 2: Run them**

Run: `cd backend && make test-api-e2e SPEC=secret-value-org-blind-index`
Expected: PASS. These use a throwaway database; see `backend/CLAUDE.md` for why not to run `npm run test:e2e` directly.

- [ ] **Step 3: Commit**

```bash
git add backend/e2e-test/secret-value-org-blind-index.spec.ts
git commit -m "test(blind-index): cover org blind index writes end to end"
```

---

### Task 8: Make the field required so the compiler proves nothing was missed

**Files:**
- Modify: `backend/src/services/secret-v2-bridge/secret-v2-bridge-types.ts`
- Modify: whatever the compiler reports

**Interfaces:**
- Consumes: everything above.
- Produces: `blindIndexes` is a required key on the bulk write inputs.

Up to now the org field has been optional, so a missed call site compiles and silently writes a null digest. This task removes that escape.

- [ ] **Step 1: Collapse the two fields into one required object**

In `TFnSecretBulkInsert`, drop both scalar fields and require the pair, omitting the generated columns so they cannot arrive by another route:

```typescript
  inputSecrets: Array<
    Omit<TSecretsV2Insert, "folderId" | "metadata" | "secretValueBlindIndex" | "secretValueOrgBlindIndex"> & {
      tagIds?: string[];
      references: TSecretReference[];
      secretMetadata?: { key: string; value?: string | null; encryptedValue?: Buffer | null }[];
      parentSecretVersionId?: string;
      blindIndexes: TSecretValueBlindIndexes | null;
    }
  >;
```

and the same in the value-carrying arm of `TRequireReferenceIfValue`. The no-value arm gets `blindIndexes?: never`.

- [ ] **Step 2: Run the type checker and fix every site it names**

Run: `cd backend && npm run type:check`
Expected: errors at every call site that has not been converted. Each fix is the spread from Task 4 Step 2: pass `blindIndexes` from `blindIndexer.generate` or `blindIndexer.generateOptional`, and let `fnSecretBulkInsert` spread it into the row.

In `fnSecretBulkInsert`, the destructure from Task 3 Step 2 becomes:

```typescript
  const sanitizedInputSecrets = inputSecrets.map(
    ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      reminderNote,
      encryptedValue,
      reminderRepeatDays,
      blindIndexes
    }) => ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      reminderNote,
      encryptedValue,
      reminderRepeatDays,
      secretValueBlindIndex: blindIndexes?.secretValueBlindIndex ?? null,
      secretValueOrgBlindIndex: blindIndexes?.secretValueOrgBlindIndex ?? null
    })
  );
```

- [ ] **Step 3: Re-run everything**

Run: `cd backend && make test-api-unit && make test-api-e2e SPEC=secret-value-org-blind-index`
Expected: PASS.

- [ ] **Step 4: Run the repo gate**

Run: `make reviewable-api`
Expected: clean. Then read the change against `backend/CODE_QUALITY.md`, paying particular attention to the deadlock section: confirm no `createSecretBlindIndexer` call sits inside a `transaction()` callback, and that every call inside one forwards `tx`.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "refactor(blind-index): require both blind indexes on secret writes"
```

---

## What this plan deliberately leaves out

Recorded so the next person does not think it was forgotten.

- The org backfill. Existing secrets pick the digest up the next time they are written. A full backfill fans out over every project in an org, needs the resume predicate `encryptedValue IS NOT NULL AND "secretValueOrgBlindIndex" IS NULL`, and has to cover `secret_versions_v2`, which is the larger table.
- An org-level completeness flag, the analog of `projects.secretBlindIndexEnabled`, gating reads until that backfill finishes.
- Every read path: org-level reuse checks, org-wide duplicate insights, search by value.
- Error message wording. Per SECRETS-701, an org-level reuse error must not name the project or secret holding the value, which means `TDuplicateSecret` does not grow a project field.
- The UI for the org flag. SECRETS-512 and PR #8100 are building an org-wide surface for blind indexing; the flag should land there rather than becoming a second control.
- Scoping the HKDF context string. The spec floats `infisical-secret-value-blind-index-v1-org` so a digest derived under one scope can never be read as the other. The two data keys already differ, so this buys nothing today, and adding it later costs a rehash of every org digest written before the change. Decide it before this ships or not at all.
- Storing the column as `bytea` instead of 64 hex characters. Roughly half the storage, and 16 bytes would halve it again with no realistic collision risk, at the cost of no longer matching the existing column. Same one-way door as above: changing it after rows exist means rewriting them.
