import { decode } from "jsonwebtoken";

import { TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { MfaMethod } from "@app/services/auth/auth-type";

import { TTestSmtpService } from "../../mocks/smtp";
import { loginUser, selectOrg } from "../../testUtils/auth";

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
});
