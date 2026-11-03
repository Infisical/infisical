import crypto from "node:crypto";

import { decode } from "jsonwebtoken";

import { OrgMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { MfaMethod } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";
import { loginUser, selectOrg } from "../../testUtils/auth";
import { addUserMembership } from "../../testUtils/users";

describe("Auth MFA V3", () => {
  const smtp = () => (globalThis as unknown as { testSmtp: TTestSmtpService }).testSmtp;
  const db = () => (globalThis as unknown as { testDb: import("knex").Knex }).testDb;

  beforeAll(async () => {
    await db()(TableName.Organization).where({ id: seedData1.organization.id }).update({
      enforceMfa: true
    });
  });

  afterAll(async () => {
    await db()(TableName.Organization).where({ id: seedData1.organization.id }).update({
      enforceMfa: false
    });
  });

  beforeEach(() => {
    smtp().clear();
  });

  test("Select-org with MFA enforced returns MFA token", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    const { statusCode, payload } = await selectOrg(accessToken, seedData1.organization.id);

    expect(statusCode).toBe(200);
    expect(payload.isMfaEnabled).toBe(true);
    expect(payload.mfaMethod).toBe(MfaMethod.EMAIL);
    expect(payload).toHaveProperty("token");
  });

  test("MFA token contains email claim", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    const { payload } = await selectOrg(accessToken, seedData1.organization.id);
    const decoded = decode(payload.token) as Record<string, unknown>;

    expect(decoded.email).toBe(seedData1.email);
  });

  test("Verify MFA with correct code succeeds", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    const { payload: mfaPayload } = await selectOrg(accessToken, seedData1.organization.id);
    expect(mfaPayload.isMfaEnabled).toBe(true);

    // Extract the MFA code from the emailed message
    const lastEmail = smtp().getLastEmail();
    expect(lastEmail).toBeDefined();
    const mfaCode = (lastEmail?.substitutions as Record<string, string>)?.code;
    expect(mfaCode).toBeDefined();

    // Verify MFA
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v2/auth/mfa/verify",
      headers: {
        authorization: `Bearer ${mfaPayload.token}`
      },
      body: {
        mfaToken: mfaCode,
        mfaMethod: MfaMethod.EMAIL
      }
    });

    expect(res.statusCode).toBe(200);
    const verifyPayload = res.json();
    expect(verifyPayload).toHaveProperty("token");
  });

  test("Verify MFA with wrong code fails", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    const { payload: mfaPayload } = await selectOrg(accessToken, seedData1.organization.id);
    expect(mfaPayload.isMfaEnabled).toBe(true);

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v2/auth/mfa/verify",
      headers: {
        authorization: `Bearer ${mfaPayload.token}`
      },
      body: {
        mfaToken: "000000",
        mfaMethod: MfaMethod.EMAIL
      }
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  // The MFA policy belongs to the root org, so one verified session must cover every switch between
  // that root and its sub-orgs; only a different root org may prompt again.
  describe("sub-organization switching", () => {
    const rootOrgId = seedData1.organization.id;
    const createdOrgIds: string[] = [];
    let subOrgA: string;
    let subOrgB: string;
    let otherRootOrgId: string;

    const makeOrgWithSeedUser = async (parentRootOrgId?: string) => {
      const [org] = await db()(TableName.Organization)
        .insert({
          name: `mfa-${crypto.randomUUID()}`,
          slug: `mfa-${crypto.randomUUID()}`,
          rootOrgId: parentRootOrgId ?? null,
          parentOrgId: parentRootOrgId ?? null,
          enforceMfa: true
        })
        .returning("*");
      createdOrgIds.push(org.id);
      await addUserMembership({ userId: seedData1.id, orgId: org.id, role: OrgMembershipRole.Member });
      return org.id as string;
    };

    const verifyMfa = async (mfaToken: string) => {
      const code = (smtp().getLastEmail()?.substitutions as Record<string, string>)?.code;
      expect(code).toBeDefined();
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v2/auth/mfa/verify",
        headers: { authorization: `Bearer ${mfaToken}` },
        body: { mfaToken: code, mfaMethod: MfaMethod.EMAIL }
      });
      expect(res.statusCode).toBe(200);
      return res.json().token as string;
    };

    // Mirrors the web app: the verified token is scoped to the root org, so landing in the org that
    // was selected takes one more select-org call with it.
    const loginInto = async (orgId: string) => {
      const { accessToken } = await loginUser(seedData1.email, seedData1.password);
      smtp().clear();
      const { payload } = await selectOrg(accessToken, orgId);
      expect(payload.isMfaEnabled).toBe(true);
      const verifiedToken = await verifyMfa(payload.token);
      const { payload: scoped } = await selectOrg(verifiedToken, orgId);
      expect(scoped.isMfaEnabled).toBe(false);
      return scoped.token as string;
    };

    beforeAll(async () => {
      subOrgA = await makeOrgWithSeedUser(rootOrgId);
      subOrgB = await makeOrgWithSeedUser(rootOrgId);
      otherRootOrgId = await makeOrgWithSeedUser();
    });

    afterAll(async () => {
      await db()(TableName.Organization).whereIn("id", createdOrgIds).del();
    });

    test("parent then child does not prompt again", async () => {
      const token = await loginInto(rootOrgId);

      const { payload } = await selectOrg(token, subOrgA);

      expect(payload.isMfaEnabled).toBe(false);
      expect(decode(payload.token)).toMatchObject({ organizationId: rootOrgId, subOrganizationId: subOrgA });
    });

    test("child then parent does not prompt again", async () => {
      const token = await loginInto(subOrgA);
      expect(decode(token)).toMatchObject({ organizationId: rootOrgId, subOrganizationId: subOrgA });

      const { payload } = await selectOrg(token, rootOrgId);

      expect(payload.isMfaEnabled).toBe(false);
      expect(decode(payload.token)).toMatchObject({ organizationId: rootOrgId });
      expect(decode(payload.token)).not.toHaveProperty("subOrganizationId");
    });

    test("child then sibling child does not prompt again", async () => {
      const token = await loginInto(subOrgA);

      const { payload } = await selectOrg(token, subOrgB);

      expect(payload.isMfaEnabled).toBe(false);
      expect(decode(payload.token)).toMatchObject({ organizationId: rootOrgId, subOrganizationId: subOrgB });
    });

    test("a different root org still prompts", async () => {
      const token = await loginInto(subOrgA);

      const { payload } = await selectOrg(token, otherRootOrgId);

      expect(payload.isMfaEnabled).toBe(true);
      expect(payload.mfaMethod).toBe(MfaMethod.EMAIL);
    });
  });
});
