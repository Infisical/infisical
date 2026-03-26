import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Import after mocks ──
import { authLoginServiceFactory } from "./auth-login-service";
import { AuthMethod, AuthTokenType, MfaMethod } from "./auth-type";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    AUTH_SECRET: "test-secret",
    JWT_AUTH_LIFETIME: "1h",
    JWT_REFRESH_LIFETIME: "7d",
    JWT_MFA_LIFETIME: "5m",
    SALT_ROUNDS: 10,
    OTEL_TELEMETRY_COLLECTION_ENABLED: false,
    isCloud: false
  })
}));

const mockJwtSign = vi.fn().mockReturnValue("mock-token");
const mockJwtVerify = vi.fn();
const mockJwt = { sign: mockJwtSign, verify: mockJwtVerify };

vi.mock("@app/lib/crypto", () => ({
  crypto: {
    jwt: () => mockJwt,
    hashing: () => ({
      compareHash: vi.fn().mockResolvedValue(true),
      createHash: vi.fn().mockResolvedValue("hashed")
    }),
    encryption: () => ({
      symmetric: () => ({
        encryptWithRootEncryptionKey: vi.fn().mockReturnValue({
          iv: "iv",
          tag: "tag",
          ciphertext: "cipher",
          encoding: "utf8"
        })
      })
    })
  },
  generateSrpServerKey: vi.fn().mockResolvedValue({ privateKey: "priv", pubKey: "pub" }),
  srpCheckClientProof: vi.fn().mockResolvedValue(true)
}));

vi.mock("@app/lib/crypto/srp", () => ({
  getUserPrivateKey: vi.fn().mockResolvedValue("private-key")
}));

vi.mock("@app/services/super-admin/super-admin-service", () => ({
  getServerCfg: vi.fn().mockResolvedValue({
    allowSignUp: true,
    enabledLoginMethods: null,
    allowedSignUpDomain: null,
    defaultAuthOrgId: null
  })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

// ── Mocks ──

const mockUserDAL = {
  findUserEncKeyByUsername: vi.fn(),
  findUserEncKeyByUserId: vi.fn(),
  findById: vi.fn(),
  findUserByUsername: vi.fn(),
  updateById: vi.fn(),
  updateUserEncryptionByUserId: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn()
};

const mockUserAuthenticationDAL = {
  findByUserId: vi.fn(),
  findByExternalIdAndType: vi.fn(),
  create: vi.fn(),
  deleteById: vi.fn(),
  updateById: vi.fn()
};

const mockOrgDAL = {
  findById: vi.fn(),
  findAllOrgsByUserId: vi.fn(),
  findEffectiveOrgMembership: vi.fn(),
  findOrgById: vi.fn(),
  findOrgBySlug: vi.fn(),
  updateById: vi.fn(),
  findOrgMembersByRole: vi.fn()
};

const mockTokenService = {
  getUserTokenSession: vi.fn().mockResolvedValue({ id: "session-1", accessVersion: 1, refreshVersion: 1 }),
  createTokenForUser: vi.fn().mockResolvedValue("mfa-code"),
  validateTokenForUser: vi.fn(),
  clearTokenSessionById: vi.fn()
};

const mockSmtpService = { sendMail: vi.fn() };
const mockTotpService = { verifyUserTotp: vi.fn(), verifyWithUserRecoveryCode: vi.fn() };
const mockAuditLogService = { createAuditLog: vi.fn() };
const mockMembershipUserDAL = { create: vi.fn(), update: vi.fn() };
const mockMembershipRoleDAL = { create: vi.fn() };
const mockNotificationService = { createUserNotifications: vi.fn() };
const mockKeyStore = { acquireLock: vi.fn(), setItemWithExpiry: vi.fn(), getItem: vi.fn() };

const createService = () =>
  authLoginServiceFactory({
    userDAL: mockUserDAL as never,
    userAuthenticationDAL: mockUserAuthenticationDAL as never,
    orgDAL: mockOrgDAL as never,
    tokenService: mockTokenService as never,
    smtpService: mockSmtpService as never,
    totpService: mockTotpService as never,
    auditLogService: mockAuditLogService as never,
    membershipUserDAL: mockMembershipUserDAL as never,
    membershipRoleDAL: mockMembershipRoleDAL as never,
    notificationService: mockNotificationService as never,
    keyStore: mockKeyStore as never
  });

describe("authLoginService", () => {
  let service: ReturnType<typeof authLoginServiceFactory>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenService.getUserTokenSession.mockResolvedValue({
      id: "session-1",
      accessVersion: 1,
      refreshVersion: 1
    });
    service = createService();
  });

  // ── loginGenServerPublicKey ──

  describe("loginGenServerPublicKey", () => {
    it("should reject email/password login when UserAuthentication.type is not email", async () => {
      mockUserDAL.findUserEncKeyByUsername.mockResolvedValue([
        { userId: "user-1", username: "tre@company-a.com", isAccepted: true, salt: "s", verifier: "v" }
      ]);
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue({
        type: AuthMethod.OIDC,
        externalId: "okta-123"
      });

      await expect(
        service.loginGenServerPublicKey({
          email: "tre@company-a.com",
          clientPublicKey: "client-pub"
        })
      ).rejects.toThrow();
    });

    it("should allow email/password login when UserAuthentication.type is email", async () => {
      mockUserDAL.findUserEncKeyByUsername.mockResolvedValue([
        { userId: "user-1", username: "tre@gmail.com", isAccepted: true, salt: "s", verifier: "v" }
      ]);
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue({
        type: AuthMethod.EMAIL,
        externalId: "tre@gmail.com"
      });
      mockOrgDAL.findAllOrgsByUserId.mockResolvedValue([]);
      mockUserDAL.updateUserEncryptionByUserId.mockResolvedValue({ salt: "s" });

      const result = await service.loginGenServerPublicKey({
        email: "tre@gmail.com",
        clientPublicKey: "client-pub"
      });

      expect(result).toHaveProperty("salt");
      expect(result).toHaveProperty("serverPublicKey");
    });
  });

  // ── selectOrganization ──

  describe("selectOrganization", () => {
    it("should NOT enforce authEnforced on the organization", async () => {
      // Even if the org has authEnforced=true, selectOrganization should not reject
      // Auth enforcement is now at login time via UserAuthentication.type
      mockJwtVerify.mockReturnValue({
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        authMethod: AuthMethod.EMAIL,
        userId: "user-1",
        tokenVersionId: "session-1",
        accessVersion: 1
      });

      mockUserDAL.findUserEncKeyByUserId.mockResolvedValue({
        userId: "user-1",
        id: "user-1",
        email: "tre@company-a.com"
      });
      mockOrgDAL.findEffectiveOrgMembership.mockResolvedValue({ id: "mem-1", isActive: true });
      mockOrgDAL.findById.mockResolvedValue({
        id: "org-1",
        authEnforced: true, // old flag — should be ignored
        enforceMfa: false,
        rootOrgId: null
      });

      const result = await service.selectOrganization({
        organizationId: "org-1",
        authJwtToken: "Bearer mock-jwt",
        userAgent: "test-agent",
        ipAddress: "127.0.0.1"
      });

      // Should succeed — not throw about SSO enforcement
      expect(result).toHaveProperty("isMfaEnabled", false);
    });

    it("should still enforce MFA when user has MFA enabled", async () => {
      mockJwtVerify.mockReturnValue({
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        authMethod: AuthMethod.EMAIL,
        userId: "user-1",
        tokenVersionId: "session-1",
        accessVersion: 1
      });

      mockUserDAL.findUserEncKeyByUserId.mockResolvedValue({
        userId: "user-1",
        id: "user-1",
        email: "tre@gmail.com",
        isMfaEnabled: true,
        selectedMfaMethod: MfaMethod.EMAIL
      });
      mockOrgDAL.findEffectiveOrgMembership.mockResolvedValue({ id: "mem-1", isActive: true });
      mockOrgDAL.findById.mockResolvedValue({
        id: "org-1",
        enforceMfa: false,
        rootOrgId: null
      });

      const result = await service.selectOrganization({
        organizationId: "org-1",
        authJwtToken: "Bearer mock-jwt",
        userAgent: "test-agent",
        ipAddress: "127.0.0.1"
      });

      expect(result).toHaveProperty("isMfaEnabled", true);
    });
  });

  // ── oauth2Login ──

  describe("oauth2Login", () => {
    it("should reject social login when UserAuthentication.type is SSO", async () => {
      // User found by email, but their auth type is OIDC — block Google login
      mockUserAuthenticationDAL.findByExternalIdAndType.mockResolvedValue(null);
      mockUserDAL.findUserByUsername.mockResolvedValue([
        { id: "user-1", username: "tre@company-a.com", email: "tre@company-a.com", isAccepted: true }
      ]);
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue({
        type: AuthMethod.OIDC,
        externalId: "okta-123"
      });

      await expect(
        service.oauth2Login({
          email: "tre@company-a.com",
          firstName: "Tre",
          authMethod: AuthMethod.GOOGLE,
          providerUserId: "google-id-123"
        })
      ).rejects.toThrow("Unable to complete login");
    });

    it("should find existing user by UserAuthentication externalId", async () => {
      mockUserAuthenticationDAL.findByExternalIdAndType.mockResolvedValue({
        userId: "user-1",
        type: AuthMethod.GOOGLE,
        externalId: "google-id-123"
      });
      mockUserDAL.findById.mockResolvedValue({
        id: "user-1",
        username: "tre@gmail.com",
        email: "tre@gmail.com",
        isAccepted: true,
        isEmailVerified: true
      });
      mockOrgDAL.findAllOrgsByUserId.mockResolvedValue([]);

      const result = await service.oauth2Login({
        email: "tre@gmail.com",
        firstName: "Tre",
        authMethod: AuthMethod.GOOGLE,
        providerUserId: "google-id-123"
      });

      expect(result).toHaveProperty("providerAuthToken");
      expect(result.isUserCompleted).toBe(true);
    });

    it("should create new user with UserAuthentication when no existing user", async () => {
      mockUserAuthenticationDAL.findByExternalIdAndType.mockResolvedValue(null);
      mockUserDAL.findUserByUsername.mockResolvedValue([]);
      mockUserDAL.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}));
      mockUserDAL.create.mockResolvedValue({
        id: "new-user",
        username: "newuser@gmail.com",
        email: "newuser@gmail.com",
        isAccepted: false,
        isEmailVerified: true
      });

      const result = await service.oauth2Login({
        email: "newuser@gmail.com",
        firstName: "New",
        authMethod: AuthMethod.GOOGLE,
        providerUserId: "google-new-123"
      });

      expect(mockUserAuthenticationDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AuthMethod.GOOGLE,
          externalId: "google-new-123",
          domain: "gmail.com"
        }),
        expect.anything()
      );
      expect(result).toHaveProperty("providerAuthToken");
    });
  });

  // ── logout ──

  describe("logout", () => {
    it("should clear the token session", async () => {
      await service.logout("user-1", "session-1");
      expect(mockTokenService.clearTokenSessionById).toHaveBeenCalledWith("user-1", "session-1");
    });
  });
});
