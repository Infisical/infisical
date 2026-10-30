import crypto from "node:crypto";

import jwt, { decode } from "jsonwebtoken";

import { OrgMembershipRole, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType, MfaMethod, SsoMfaTrust } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";
import { loginUser, selectOrg } from "../../testUtils/auth";
import { overrideLicenseFeatures } from "../../testUtils/license";
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

  // Signs the org-less session directly; the callback deriving the verdict is in auth-idp.spec.ts.
  describe("identity provider MFA signal", () => {
    const rootOrgId = seedData1.organization.id;
    let restoreLicense: () => void;

    const signSsoSession = async (authMethod: AuthMethod, idpMfaOrgId?: string) => {
      const [session] = await db()(TableName.AuthTokenSession)
        .insert({
          userId: seedData1.id,
          ip: "127.0.0.1",
          userAgent: "e2e-idp-mfa-signal",
          accessVersion: 1,
          refreshVersion: 1,
          lastUsed: new Date()
        } as never)
        .returning("*");

      return jwt.sign(
        {
          authTokenType: AuthTokenType.ACCESS_TOKEN,
          authMethod,
          userId: seedData1.id,
          tokenVersionId: session.id,
          accessVersion: 1,
          ...(idpMfaOrgId && { idpMfaOrgId })
        },
        process.env.AUTH_SECRET as string,
        { expiresIn: "1h" }
      );
    };

    const setSsoMfaTrust = (ssoMfaTrust: SsoMfaTrust) =>
      db()(TableName.Organization).where({ id: rootOrgId }).update({ ssoMfaTrust });

    const updateOrg = (body: Record<string, unknown>) =>
      testServer.inject({
        method: "PATCH",
        url: `/api/v1/organization/${rootOrgId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` },
        body
      });

    beforeAll(() => {
      restoreLicense = overrideLicenseFeatures({ enforceMfa: true });
    });

    afterAll(async () => {
      restoreLicense();
      await setSsoMfaTrust(SsoMfaTrust.None);
    });

    test.each([AuthMethod.OKTA_SAML, AuthMethod.OIDC])(
      "a signalled %s session skips the prompt when the org trusts the signal",
      async (authMethod) => {
        await setSsoMfaTrust(SsoMfaTrust.Signal);

        const { payload } = await selectOrg(await signSsoSession(authMethod, rootOrgId), rootOrgId);

        expect(payload.isMfaEnabled).toBe(false);
        expect(decode(payload.token)).toMatchObject({ organizationId: rootOrgId, idpMfaOrgId: rootOrgId });
      }
    );

    test("an SSO session that carried no signal still gets the prompt", async () => {
      await setSsoMfaTrust(SsoMfaTrust.Signal);

      const { payload } = await selectOrg(await signSsoSession(AuthMethod.OKTA_SAML), rootOrgId);

      expect(payload.isMfaEnabled).toBe(true);
      expect(payload.mfaMethod).toBe(MfaMethod.EMAIL);
    });

    test("the root org's proof also covers its sub-organizations", async () => {
      await setSsoMfaTrust(SsoMfaTrust.Signal);
      const [subOrg] = await db()(TableName.Organization)
        .insert({
          name: `idp-mfa-${crypto.randomUUID()}`,
          slug: `idp-mfa-${crypto.randomUUID()}`,
          rootOrgId,
          parentOrgId: rootOrgId,
          enforceMfa: true
        })
        .returning("*");
      try {
        await addUserMembership({ userId: seedData1.id, orgId: subOrg.id, role: OrgMembershipRole.Member });

        const { payload } = await selectOrg(await signSsoSession(AuthMethod.OKTA_SAML, rootOrgId), subOrg.id);

        expect(payload.isMfaEnabled).toBe(false);
        expect(decode(payload.token)).toMatchObject({
          organizationId: rootOrgId,
          subOrganizationId: subOrg.id,
          idpMfaOrgId: rootOrgId
        });
      } finally {
        await db()(TableName.Organization).where({ id: subOrg.id }).del();
      }
    });

    test("a proof produced by another organization's IdP still gets the prompt", async () => {
      await setSsoMfaTrust(SsoMfaTrust.Signal);

      const { payload } = await selectOrg(await signSsoSession(AuthMethod.OKTA_SAML, crypto.randomUUID()), rootOrgId);

      expect(payload.isMfaEnabled).toBe(true);
    });

    test("a password session on the same org still gets the prompt", async () => {
      await setSsoMfaTrust(SsoMfaTrust.Signal);
      const { accessToken } = await loginUser(seedData1.email, seedData1.password);

      const { payload } = await selectOrg(accessToken, rootOrgId);

      expect(payload.isMfaEnabled).toBe(true);
    });

    test("the signal is ignored while the org requires Infisical MFA", async () => {
      await setSsoMfaTrust(SsoMfaTrust.None);

      const { payload } = await selectOrg(await signSsoSession(AuthMethod.OKTA_SAML, rootOrgId), rootOrgId);

      expect(payload.isMfaEnabled).toBe(true);
    });

    test("the setting cannot be turned on without an active SSO configuration", async () => {
      const res = await updateOrg({ ssoMfaTrust: SsoMfaTrust.Signal });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/SAML or OIDC/);
    });

    test("a user's own MFA is still prompted when only the user, not the org, requires it", async () => {
      await setSsoMfaTrust(SsoMfaTrust.Signal);
      await db()(TableName.Organization).where({ id: rootOrgId }).update({ enforceMfa: false });
      await db()(TableName.Users).where({ id: seedData1.id }).update({ isMfaEnabled: true });
      try {
        const { payload } = await selectOrg(await signSsoSession(AuthMethod.OKTA_SAML, rootOrgId), rootOrgId);

        expect(payload.isMfaEnabled).toBe(true);
      } finally {
        await db()(TableName.Users).where({ id: seedData1.id }).update({ isMfaEnabled: false });
        await db()(TableName.Organization).where({ id: rootOrgId }).update({ enforceMfa: true });
      }
    });

    test("an unknown mode is rejected", async () => {
      const res = await updateOrg({ ssoMfaTrust: "delegate" });

      expect(res.statusCode).toBe(422);
    });

    test("the setting can be turned off even on a plan without MFA enforcement", async () => {
      await setSsoMfaTrust(SsoMfaTrust.Signal);
      restoreLicense();
      try {
        const res = await updateOrg({ ssoMfaTrust: SsoMfaTrust.None });

        expect(res.statusCode).toBe(200);
        expect(res.json().organization.ssoMfaTrust).toBe(SsoMfaTrust.None);
      } finally {
        restoreLicense = overrideLicenseFeatures({ enforceMfa: true });
      }
    });
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
