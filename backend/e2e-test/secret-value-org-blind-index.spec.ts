import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { SecretType, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

declare const testDb: Knex;

// The digests are what the feature exists to produce, so these assertions read them straight off the
// row rather than through an API that does not expose them.
type TDigests = { secretValueBlindIndex: string | null; secretValueOrgBlindIndex: string | null };

const readSecretRow = async (secretId: string): Promise<TDigests> => {
  const row = await testDb(TableName.SecretV2)
    .where({ id: secretId })
    .select("secretValueBlindIndex", "secretValueOrgBlindIndex")
    .first();
  if (!row) throw new Error(`No secrets_v2 row for '${secretId}'`);
  return row as TDigests;
};

const readLatestVersionRow = async (secretId: string): Promise<TDigests> => {
  const row = await testDb(TableName.SecretVersionV2)
    .where({ secretId })
    .orderBy("version", "desc")
    .select("secretValueBlindIndex", "secretValueOrgBlindIndex")
    .first();
  if (!row) throw new Error(`No secret_versions_v2 row for secret '${secretId}'`);
  return row as TDigests;
};

const createSecret = async (dto: { key: string; value: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretPath: "/",
      secretKey: dto.key,
      secretValue: dto.value
    }
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload).secret as { id: string };
};

const updateSecret = async (dto: { key: string; value: string }) => {
  const res = await testServer.inject({
    method: "PATCH",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretPath: "/",
      secretValue: dto.value
    }
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.payload).secret as { id: string };
};

const deleteSecret = async (key: string) => {
  await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/raw/${key}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      workspaceId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretPath: "/"
    }
  });
};

const setOrgBlindIndexEnabled = async (enabled: boolean) =>
  testDb(TableName.Organization)
    .where({ id: seedData1.organization.id })
    .update({ secretValueOrgBlindIndexEnabled: enabled });

describe("secret value org blind index", () => {
  const keys: string[] = [];

  const key = (label: string) => {
    const name = `ORG_BI_${label}_${randomUUID().slice(0, 8)}`.toUpperCase();
    keys.push(name);
    return name;
  };

  beforeAll(async () => {
    await setOrgBlindIndexEnabled(true);
  });

  afterAll(async () => {
    await Promise.all(keys.map((k) => deleteSecret(k)));
    await setOrgBlindIndexEnabled(true);
  });

  test("a created secret carries both digests on the secret and its version", async () => {
    const name = key("create");
    const secret = await createSecret({ key: name, value: "a-value" });

    const [row, version] = await Promise.all([readSecretRow(secret.id), readLatestVersionRow(secret.id)]);

    expect(row.secretValueBlindIndex).toEqual(expect.any(String));
    expect(row.secretValueOrgBlindIndex).toEqual(expect.any(String));
    expect(version.secretValueBlindIndex).toBe(row.secretValueBlindIndex);
    expect(version.secretValueOrgBlindIndex).toBe(row.secretValueOrgBlindIndex);
  });

  test("the org digest differs from the project digest for the same value", async () => {
    const name = key("distinct");
    const secret = await createSecret({ key: name, value: "another-value" });

    const row = await readSecretRow(secret.id);

    expect(row.secretValueOrgBlindIndex).not.toBe(row.secretValueBlindIndex);
  });

  test("two secrets holding the same value share both digests", async () => {
    const value = `shared-${randomUUID()}`;
    const first = await createSecret({ key: key("same_a"), value });
    const second = await createSecret({ key: key("same_b"), value });

    const [a, b] = await Promise.all([readSecretRow(first.id), readSecretRow(second.id)]);

    expect(a.secretValueOrgBlindIndex).toBe(b.secretValueOrgBlindIndex);
    expect(a.secretValueBlindIndex).toBe(b.secretValueBlindIndex);
  });

  test("secrets holding different values get different org digests", async () => {
    const first = await createSecret({ key: key("diff_a"), value: `one-${randomUUID()}` });
    const second = await createSecret({ key: key("diff_b"), value: `two-${randomUUID()}` });

    const [a, b] = await Promise.all([readSecretRow(first.id), readSecretRow(second.id)]);

    expect(a.secretValueOrgBlindIndex).not.toBe(b.secretValueOrgBlindIndex);
  });

  test("an update rewrites both digests", async () => {
    const name = key("update");
    const created = await createSecret({ key: name, value: "before" });
    const before = await readSecretRow(created.id);

    await updateSecret({ key: name, value: "after" });
    const after = await readSecretRow(created.id);

    expect(after.secretValueBlindIndex).not.toBe(before.secretValueBlindIndex);
    expect(after.secretValueOrgBlindIndex).not.toBe(before.secretValueOrgBlindIndex);
    expect(after.secretValueOrgBlindIndex).toEqual(expect.any(String));
  });

  test("an org that has opted out gets no org digest on the secret or its version", async () => {
    await setOrgBlindIndexEnabled(false);

    const name = key("optout");
    const secret = await createSecret({ key: name, value: "not-fingerprinted" });

    const [row, version] = await Promise.all([readSecretRow(secret.id), readLatestVersionRow(secret.id)]);

    expect(row.secretValueBlindIndex).toEqual(expect.any(String));
    expect(row.secretValueOrgBlindIndex).toBeNull();
    expect(version.secretValueOrgBlindIndex).toBeNull();

    await setOrgBlindIndexEnabled(true);
  });

  test("turning the opt-out back off resumes writing the org digest on the next write", async () => {
    await setOrgBlindIndexEnabled(false);
    const name = key("resume");
    const created = await createSecret({ key: name, value: "first" });
    const whileOptedOut = await readSecretRow(created.id);
    expect(whileOptedOut.secretValueOrgBlindIndex).toBeNull();

    await setOrgBlindIndexEnabled(true);
    await updateSecret({ key: name, value: "second" });

    const afterOptIn = await readSecretRow(created.id);
    expect(afterOptIn.secretValueOrgBlindIndex).toEqual(expect.any(String));
  });
});
