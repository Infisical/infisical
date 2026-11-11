import type { TActorContext } from "@app/domains/lib/actor-context";
import { Permission } from "@app/domains/platform/access-control/ce/module";
import { FakeLicenseDomain } from "@app/domains/platform/license/ce/testing/fake-license-domain";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAlertWithChannels } from "./pki-alert-v2-dal";
import { pkiAlertV2ServiceFactory } from "./pki-alert-v2-service";
import { PkiAlertChannelType, PkiAlertEventType } from "./pki-alert-v2-types";

const PROJECT_ID = "project-1";
const APPLICATION_ID = "application-1";
const ALERT_ID = "alert-1";

const actor = {
  actor: { principal: { type: "user", id: "actor-1" }, org: { id: "org-1" } } as unknown as TActorContext
};

const legacyApplicationAlert: TAlertWithChannels = {
  id: ALERT_ID,
  projectId: PROJECT_ID,
  applicationId: APPLICATION_ID,
  name: "expiring-certs",
  description: null,
  eventType: PkiAlertEventType.EXPIRATION,
  alertBefore: "30d",
  filters: [],
  enabled: true,
  notificationConfig: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  channels: [
    {
      id: "channel-1",
      channelType: PkiAlertChannelType.EMAIL,
      config: { recipients: ["ops@example.com"] },
      encryptedConfig: null,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  lastRunData: null
} as unknown as TAlertWithChannels;

const buildService = () => {
  const allowAll = Permission.fromRules({ rules: [{ action: "manage", subject: "all" }] });
  const pkiAlertV2DAL = {
    findById: vi.fn(async () => legacyApplicationAlert),
    findByIdWithChannels: vi.fn(async () => legacyApplicationAlert),
    create: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(async () => legacyApplicationAlert),
    transaction: vi.fn()
  };
  const projectsDomain = { getProjectPermission: vi.fn(async () => allowAll) };
  const certManagerDomain = { getApplicationPermission: vi.fn(async () => allowAll) };
  const service = pkiAlertV2ServiceFactory({
    pkiAlertV2DAL,
    pkiAlertChannelDAL: {},
    pkiAlertHistoryDAL: {},
    projectsDomain,
    certManagerDomain,
    licenseDomain: new FakeLicenseDomain(),
    smtpService: {},
    kmsCoreDomain: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: () => ({ cipherTextBlob: Buffer.from("") }),
        decryptor: () => Buffer.from("")
      }))
    },
    notificationService: {},
    projectMembershipDAL: {},
    projectDAL: {},
    pkiApplicationDAL: {}
  } as unknown as Parameters<typeof pkiAlertV2ServiceFactory>[0]);

  return { service, pkiAlertV2DAL, certManagerDomain };
};

describe("pkiAlertV2Service legacy alerts", () => {
  test("rejects creating a legacy alert and points to the alerts API", async () => {
    const { service, pkiAlertV2DAL, certManagerDomain } = buildService();

    const error = await service
      .createAlert({
        ...actor,
        projectId: PROJECT_ID,
        applicationId: APPLICATION_ID,
        name: "new-alert",
        eventType: PkiAlertEventType.ISSUANCE,
        enabled: true,
        filters: [],
        channels: []
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toContain("/api/v1/alerts");
    expect(certManagerDomain.getApplicationPermission).not.toHaveBeenCalled();
    expect(pkiAlertV2DAL.create).not.toHaveBeenCalled();
  });

  test("rejects editing a legacy alert, including enabling or disabling it", async () => {
    const { service, pkiAlertV2DAL } = buildService();

    await expect(service.updateAlert({ ...actor, alertId: ALERT_ID, enabled: false })).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(pkiAlertV2DAL.findById).not.toHaveBeenCalled();
    expect(pkiAlertV2DAL.updateById).not.toHaveBeenCalled();
  });

  test("reads an application-scoped legacy alert with the application's permissions", async () => {
    const { service, certManagerDomain } = buildService();

    const alert = await service.getAlertById({ ...actor, alertId: ALERT_ID, applicationId: APPLICATION_ID });

    expect(alert.applicationId).toBe(APPLICATION_ID);
    expect(alert.channels).toHaveLength(1);
    expect(certManagerDomain.getApplicationPermission).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: APPLICATION_ID, projectId: PROJECT_ID })
    );
  });

  test("deletes an application-scoped legacy alert", async () => {
    const { service, pkiAlertV2DAL } = buildService();

    const alert = await service.deleteAlert({ ...actor, alertId: ALERT_ID, applicationId: APPLICATION_ID });

    expect(alert.id).toBe(ALERT_ID);
    expect(pkiAlertV2DAL.deleteById).toHaveBeenCalledWith(ALERT_ID);
  });

  test("does not delete a legacy alert through another application", async () => {
    const { service, pkiAlertV2DAL } = buildService();

    await expect(
      service.deleteAlert({ ...actor, alertId: ALERT_ID, applicationId: "application-2" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(pkiAlertV2DAL.deleteById).not.toHaveBeenCalled();
  });
});
