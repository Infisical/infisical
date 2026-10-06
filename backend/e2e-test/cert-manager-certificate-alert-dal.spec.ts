import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AlertRunStatus } from "@app/services/alert/alert-types";
import { certManagerCertificateAlertDALFactory } from "@app/services/alert/providers/cert-manager-certificate-alert-dal";

declare const testDb: Knex;

const dal = certManagerCertificateAlertDALFactory(testDb as never);

const PROJECT_ID = seedData1.project.id;
const ORG_ID = seedData1.organization.id;
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();
const since = new Date(now.getTime() - DAY_MS);
const tag = randomUUID().slice(0, 8);

const CERTIFICATE_KEYS = ["bothChannels", "oneChannel", "beforeWindow", "oneFailed", "neverAlerted"] as const;
const certificateIds = {} as Record<(typeof CERTIFICATE_KEYS)[number], string>;
const allCertificateIds = () => Object.values(certificateIds);

let alertId: string;
let channelIds: string[];

const insertCertificate = async (key: string, expiresInDays: number) => {
  const [certificate] = await testDb(TableName.Certificate)
    .insert({
      projectId: PROJECT_ID,
      status: "active",
      serialNumber: `${tag}-${key}`,
      friendlyName: `e2e-${tag}`,
      commonName: `e2e-${tag}-${key}.example.com`,
      notBefore: now,
      notAfter: new Date(now.getTime() + expiresInDays * DAY_MS)
    })
    .returning("id");
  return certificate.id;
};

const insertDelivery = async (
  certificateId: string,
  deliveries: { channelId: string; status: AlertRunStatus }[],
  triggeredAt: Date
) => {
  const [history] = await testDb(TableName.AlertHistory)
    .insert({ alertId, status: AlertRunStatus.SUCCESS, triggeredAt })
    .returning("id");
  await testDb(TableName.AlertHistoryTarget).insert(
    deliveries.map(({ channelId, status }) => ({
      alertHistoryId: history.id,
      targetId: certificateId,
      channelId,
      channelType: "email",
      status
    }))
  );
};

const scan = (alreadyAlerted: { alertId: string; channelIds: string[]; since: Date }) =>
  dal.findExpiringCertificates({
    projectId: PROJECT_ID,
    alertBeforeInterval: "30 days",
    leadInterval: "1 day",
    asOf: now,
    alreadyAlerted
  });

const ownIds = (rows: { id: string }[]) => rows.map((row) => row.id).filter((id) => allCertificateIds().includes(id));

describe("cert manager certificate alert DAL (postgres)", () => {
  beforeAll(async () => {
    const [alert] = await testDb(TableName.Alert)
      .insert({
        name: `e2e-${tag}`,
        resourceType: "cert-manager.application",
        eventType: "cert-manager.application.certificate.expiry",
        triggerType: "scheduled",
        orgId: ORG_ID,
        projectId: PROJECT_ID,
        createdByActorId: seedData1.id,
        createdByActorType: "user"
      })
      .returning("id");
    alertId = alert.id;

    const channels = await testDb(TableName.AlertChannel)
      .insert(
        [1, 2].map((index) => ({
          name: `e2e-${tag}-${index}`,
          channelType: "email",
          encryptedConfig: Buffer.from("e2e"),
          orgId: ORG_ID,
          createdByActorId: seedData1.id,
          createdByActorType: "user"
        }))
      )
      .returning("id");
    channelIds = channels.map((channel) => channel.id);

    await Promise.all(
      CERTIFICATE_KEYS.map(async (key, index) => {
        certificateIds[key] = await insertCertificate(key, index + 1);
      })
    );

    const recent = new Date(now.getTime() - 60 * 60 * 1000);
    const old = new Date(now.getTime() - 2 * DAY_MS);
    const [first, second] = channelIds;

    await insertDelivery(
      certificateIds.bothChannels,
      [
        { channelId: first, status: AlertRunStatus.SUCCESS },
        { channelId: second, status: AlertRunStatus.SUCCESS }
      ],
      recent
    );
    await insertDelivery(certificateIds.oneChannel, [{ channelId: first, status: AlertRunStatus.SUCCESS }], recent);
    await insertDelivery(
      certificateIds.beforeWindow,
      [
        { channelId: first, status: AlertRunStatus.SUCCESS },
        { channelId: second, status: AlertRunStatus.SUCCESS }
      ],
      old
    );
    await insertDelivery(
      certificateIds.oneFailed,
      [
        { channelId: first, status: AlertRunStatus.SUCCESS },
        { channelId: second, status: AlertRunStatus.FAILED }
      ],
      recent
    );
  });

  afterAll(async () => {
    await testDb(TableName.Alert).where({ id: alertId }).del();
    await testDb(TableName.AlertChannel).whereIn("id", channelIds).del();
    await testDb(TableName.Certificate).whereIn("id", allCertificateIds()).del();
  });

  test("an alert with no deliveries yet gets every due certificate", async () => {
    const found = ownIds(await scan({ alertId: randomUUID(), channelIds, since }));
    expect(found.sort()).toEqual(allCertificateIds().sort());
  });

  test("certificates still owed to a channel come before ones already delivered on every channel", async () => {
    const found = ownIds(await scan({ alertId, channelIds, since }));
    expect(found[found.length - 1]).toBe(certificateIds.beforeWindow);
  });

  test("a certificate is dropped only when every enabled channel delivered it inside the window", async () => {
    const found = ownIds(await scan({ alertId, channelIds, since }));

    expect(found).not.toContain(certificateIds.bothChannels);
    expect(found.sort()).toEqual(
      [
        certificateIds.oneChannel,
        certificateIds.beforeWindow,
        certificateIds.oneFailed,
        certificateIds.neverAlerted
      ].sort()
    );
  });

  test("a channel outside the enabled set does not count towards the exclusion", async () => {
    const [first] = channelIds;
    const found = ownIds(await scan({ alertId, channelIds: [first], since }));

    expect(found).not.toContain(certificateIds.bothChannels);
    expect(found).not.toContain(certificateIds.oneChannel);
    expect(found).not.toContain(certificateIds.oneFailed);
    expect(found).toContain(certificateIds.beforeWindow);
    expect(found).toContain(certificateIds.neverAlerted);
  });
});
