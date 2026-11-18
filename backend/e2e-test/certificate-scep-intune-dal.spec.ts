import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge/scep-challenge-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { EnrollmentType } from "@app/services/certificate-profile/certificate-profile-types";
import { certificateDALFactory } from "@app/services/certificate/certificate-dal";
import { CertStatus } from "@app/services/certificate/certificate-types";

declare const testDb: Knex;

const dal = certificateDALFactory(testDb as never);

const tag = randomUUID().slice(0, 8);
const projectId = seedData1.project.id;
const now = Date.now();

const ids = {
  connections: [] as string[],
  scepConfigs: [] as string[],
  policies: [] as string[],
  profiles: [] as string[],
  applications: [] as string[],
  certificates: [] as string[]
};
const serials = {} as Record<string, string>;

const insertConnection = async (name: string) => {
  const [row] = await testDb(TableName.AppConnection)
    .insert({
      name: `e2e-${tag}-${name}`,
      app: AppConnection.MicrosoftIntune,
      method: "client-secret",
      orgId: seedData1.organization.id,
      encryptedCredentials: Buffer.from("e2e")
    })
    .returning("id");
  ids.connections.push(row.id as string);
  return row.id as string;
};

const insertScepConfig = async (validationConnectionId: string) => {
  const [row] = await testDb(TableName.PkiScepEnrollmentConfig)
    .insert({
      encryptedRaPrivateKey: Buffer.from("e2e"),
      raCertificate: "e2e",
      raCertExpiresAt: new Date(now + 86_400_000),
      challengeType: ScepChallengeType.MICROSOFT_INTUNE,
      validationConnectionId
    })
    .returning("id");
  ids.scepConfigs.push(row.id as string);
  return row.id as string;
};

const insertProfile = async (name: string, scepConfigId: string | null = null) => {
  const [policy] = await testDb(TableName.PkiCertificatePolicy)
    .insert({ projectId, name: `e2e-${tag}-${name}` })
    .returning("id");
  ids.policies.push(policy.id as string);
  const [profile] = await testDb(TableName.PkiCertificateProfile)
    .insert({
      projectId,
      certificatePolicyId: policy.id,
      slug: `e2e-${tag}-${name}`,
      enrollmentType: EnrollmentType.SCEP,
      scepConfigId
    })
    .returning("id");
  ids.profiles.push(profile.id as string);
  return profile.id as string;
};

const insertApplicationWithProfile = async (name: string, profileId: string, scepConfigId: string) => {
  const [application] = await testDb(TableName.PkiApplication)
    .insert({ projectId, name: `e2e-${tag}-${name}` })
    .returning("id");
  ids.applications.push(application.id as string);
  await testDb(TableName.PkiApplicationProfile).insert({ applicationId: application.id, profileId, scepConfigId });
  return application.id as string;
};

const insertCertificate = async (
  key: string,
  {
    profileId,
    applicationId = null,
    enrollmentType = EnrollmentType.SCEP,
    deletedAt = null
  }: { profileId: string; applicationId?: string | null; enrollmentType?: EnrollmentType; deletedAt?: Date | null }
) => {
  const serialNumber = `e2e${tag}${key}`.toLowerCase();
  const [certificate] = await testDb(TableName.Certificate)
    .insert({
      projectId,
      profileId,
      applicationId,
      status: CertStatus.ACTIVE,
      serialNumber,
      friendlyName: serialNumber,
      commonName: serialNumber,
      notBefore: new Date(now - 86_400_000),
      notAfter: new Date(now + 86_400_000),
      deletedAt
    })
    .returning("id");
  await testDb(TableName.CertificateRequests).insert({
    projectId,
    status: "issued",
    certificateId: certificate.id,
    enrollmentType
  });
  ids.certificates.push(certificate.id as string);
  serials[key] = serialNumber;
};

const findMatches = async (connectionIds: string[]) =>
  (await dal.findScepCertsByValidationConnectionsAndSerials(connectionIds, Object.values(serials)))
    .map((certificate) => Object.keys(serials).find((key) => serials[key] === certificate.serialNumber))
    .sort();

describe("certificate DAL: SCEP certificates by Intune validation connection (postgres)", () => {
  let tenantConnectionId: string;
  let otherTenantConnectionId: string;

  beforeAll(async () => {
    tenantConnectionId = await insertConnection("tenant");
    otherTenantConnectionId = await insertConnection("other-tenant");
    const tenantScepConfigId = await insertScepConfig(tenantConnectionId);
    const otherTenantScepConfigId = await insertScepConfig(otherTenantConnectionId);

    const applicationProfileId = await insertProfile("app-profile");
    const applicationId = await insertApplicationWithProfile("app", applicationProfileId, tenantScepConfigId);
    await insertCertificate("viaapplication", { profileId: applicationProfileId, applicationId });
    await insertCertificate("apienrollment", {
      profileId: applicationProfileId,
      applicationId,
      enrollmentType: EnrollmentType.API
    });
    await insertCertificate("softdeleted", {
      profileId: applicationProfileId,
      applicationId,
      deletedAt: new Date(now)
    });

    const profileLevelProfileId = await insertProfile("profile-level", tenantScepConfigId);
    await insertCertificate("viaprofile", { profileId: profileLevelProfileId });

    const otherTenantProfileId = await insertProfile("other-tenant-profile");
    const otherTenantApplicationId = await insertApplicationWithProfile(
      "other-tenant-app",
      otherTenantProfileId,
      otherTenantScepConfigId
    );
    await insertCertificate("othertenant", { profileId: otherTenantProfileId, applicationId: otherTenantApplicationId });

    const detachedProfileId = await insertProfile("detached-profile");
    const [detachedApplication] = await testDb(TableName.PkiApplication)
      .insert({ projectId, name: `e2e-${tag}-detached-app` })
      .returning("id");
    ids.applications.push(detachedApplication.id as string);
    await insertCertificate("detached", { profileId: detachedProfileId, applicationId: detachedApplication.id as string });
  });

  afterAll(async () => {
    await testDb(TableName.CertificateRequests).whereIn("certificateId", ids.certificates).del();
    await testDb(TableName.Certificate).whereIn("id", ids.certificates).del();
    await testDb(TableName.PkiApplicationProfile).whereIn("applicationId", ids.applications).del();
    await testDb(TableName.PkiApplication).whereIn("id", ids.applications).del();
    await testDb(TableName.PkiCertificateProfile).whereIn("id", ids.profiles).del();
    await testDb(TableName.PkiCertificatePolicy).whereIn("id", ids.policies).del();
    await testDb(TableName.PkiScepEnrollmentConfig).whereIn("id", ids.scepConfigs).del();
    await testDb(TableName.AppConnection).whereIn("id", ids.connections).del();
  });

  test("matches SCEP certificates whose current enrollment uses the tenant's connection, and nothing else", async () => {
    expect(await findMatches([tenantConnectionId])).toEqual(["softdeleted", "viaapplication", "viaprofile"]);
  });

  test("matches another tenant's certificates only through that tenant's connection", async () => {
    expect(await findMatches([otherTenantConnectionId])).toEqual(["othertenant"]);
  });
});
