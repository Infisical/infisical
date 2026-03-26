import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { AuthMethod } from "@app/services/auth/auth-type";

import { domainSsoConnectorServiceFactory, TDomainSsoConnectorServiceFactory } from "./domain-sso-connector-service";
import { DomainVerificationStatus } from "./domain-sso-connector-types";

// Mock dependencies
const mockDomainSsoConnectorDAL = {
  create: vi.fn(),
  findOne: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  findByDomain: vi.fn(),
  transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({}))
};

const mockPermissionService = {
  getOrgPermission: vi.fn().mockResolvedValue({
    permission: { can: vi.fn().mockReturnValue(true) }
  })
};

const mockOidcConfigDAL = {
  update: vi.fn()
};

const mockSamlConfigDAL = {
  update: vi.fn()
};

const mockLdapConfigDAL = {
  update: vi.fn()
};

const mockUserAuthenticationDAL = {
  find: vi.fn(),
  delete: vi.fn(),
  insertMany: vi.fn()
};

const mockDnsResolver = {
  resolveTxt: vi.fn()
};

describe("DomainSsoConnectorService", () => {
  let service: TDomainSsoConnectorServiceFactory;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mocks after clearAllMocks
    mockPermissionService.getOrgPermission.mockResolvedValue({
      permission: { can: vi.fn().mockReturnValue(true) }
    });

    service = domainSsoConnectorServiceFactory({
      domainSsoConnectorDAL: mockDomainSsoConnectorDAL as never,
      permissionService: mockPermissionService as never,
      oidcConfigDAL: mockOidcConfigDAL as never,
      samlConfigDAL: mockSamlConfigDAL as never,
      ldapConfigDAL: mockLdapConfigDAL as never,
      userAuthenticationDAL: mockUserAuthenticationDAL as never,
      dnsResolver: mockDnsResolver
    });
  });

  describe("claimDomain", () => {
    it("should create a pending connector with a generated verificationToken", async () => {
      mockDomainSsoConnectorDAL.findByDomain.mockResolvedValue(null);
      mockDomainSsoConnectorDAL.create.mockImplementation((data: Record<string, unknown>) => ({
        id: "connector-1",
        ...data
      }));

      const result = await service.claimDomain({
        domain: "company-a.com",
        ownerOrgId: "org-1",
        type: AuthMethod.OIDC,
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null
      });

      expect(mockDomainSsoConnectorDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: "company-a.com",
          ownerOrgId: "org-1",
          type: AuthMethod.OIDC,
          verificationStatus: DomainVerificationStatus.PENDING,
          isActive: false
        })
      );
      expect(result).toHaveProperty("verificationToken");
      expect(result.verificationToken).toBeTruthy();
    });

    it("should throw BadRequestError when domain is already claimed", async () => {
      mockDomainSsoConnectorDAL.findByDomain.mockResolvedValue({
        id: "existing-connector",
        domain: "company-a.com",
        ownerOrgId: "org-2"
      });

      await expect(
        service.claimDomain({
          domain: "company-a.com",
          ownerOrgId: "org-1",
          type: AuthMethod.OIDC,
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw ForbiddenRequestError when user lacks SSO permission", async () => {
      mockPermissionService.getOrgPermission.mockRejectedValue(new ForbiddenRequestError({ message: "Forbidden" }));

      await expect(
        service.claimDomain({
          domain: "company-a.com",
          ownerOrgId: "org-1",
          type: AuthMethod.OIDC,
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(ForbiddenRequestError);
    });

    it("should throw BadRequestError for invalid domain format", async () => {
      await expect(
        service.claimDomain({
          domain: "",
          ownerOrgId: "org-1",
          type: AuthMethod.OIDC,
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.claimDomain({
          domain: "not-a-domain",
          ownerOrgId: "org-1",
          type: AuthMethod.OIDC,
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should allow reclaiming a domain that was previously released", async () => {
      mockDomainSsoConnectorDAL.findByDomain.mockResolvedValue(null);
      mockDomainSsoConnectorDAL.create.mockImplementation((data: Record<string, unknown>) => ({
        id: "connector-2",
        ...data
      }));

      const result = await service.claimDomain({
        domain: "released-domain.com",
        ownerOrgId: "org-1",
        type: AuthMethod.OKTA_SAML,
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null
      });

      expect(mockDomainSsoConnectorDAL.create).toHaveBeenCalled();
      expect(result.domain).toBe("released-domain.com");
    });
  });

  describe("verifyDomain", () => {
    it("should mark domain as verified when DNS TXT record matches", async () => {
      const connector = {
        id: "connector-1",
        domain: "company-a.com",
        ownerOrgId: "org-1",
        verificationStatus: DomainVerificationStatus.PENDING,
        verificationToken: "infisical=abc123"
      };
      mockDomainSsoConnectorDAL.findById.mockResolvedValue(connector);
      mockDnsResolver.resolveTxt.mockResolvedValue([["infisical=abc123"]]);
      mockDomainSsoConnectorDAL.updateById.mockImplementation((_id: string, data: Record<string, unknown>) => ({
        ...connector,
        ...data
      }));

      await service.verifyDomain({
        connectorId: "connector-1",
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null
      });

      expect(mockDomainSsoConnectorDAL.updateById).toHaveBeenCalledWith(
        "connector-1",
        expect.objectContaining({
          verificationStatus: DomainVerificationStatus.VERIFIED
        })
      );
    });

    it("should throw NotFoundError when connector does not exist", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue(null);

      await expect(
        service.verifyDomain({
          connectorId: "nonexistent",
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when domain is already verified", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue({
        id: "connector-1",
        domain: "company-a.com",
        ownerOrgId: "org-1",
        verificationStatus: DomainVerificationStatus.VERIFIED
      });

      await expect(
        service.verifyDomain({
          connectorId: "connector-1",
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError when DNS verification fails", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue({
        id: "connector-1",
        domain: "company-a.com",
        ownerOrgId: "org-1",
        verificationStatus: DomainVerificationStatus.PENDING,
        verificationToken: "infisical=abc123"
      });
      mockDnsResolver.resolveTxt.mockResolvedValue([["wrong-value"]]);

      await expect(
        service.verifyDomain({
          connectorId: "connector-1",
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("deleteDomainConnector", () => {
    it("should delete connector and null out SSO config FKs", async () => {
      const connector = {
        id: "connector-1",
        domain: "company-a.com",
        ownerOrgId: "org-1",
        type: AuthMethod.OIDC
      };
      mockDomainSsoConnectorDAL.findById.mockResolvedValue(connector);
      mockDomainSsoConnectorDAL.deleteById.mockResolvedValue(connector);

      await service.deleteDomainConnector({
        connectorId: "connector-1",
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null
      });

      expect(mockDomainSsoConnectorDAL.deleteById).toHaveBeenCalledWith("connector-1");
      expect(mockOidcConfigDAL.update).toHaveBeenCalledWith(
        { domainSsoConnectorId: "connector-1" },
        { domainSsoConnectorId: null }
      );
    });

    it("should throw NotFoundError when connector does not exist", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue(null);

      await expect(
        service.deleteDomainConnector({
          connectorId: "nonexistent",
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenRequestError when user lacks permission", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue({
        id: "connector-1",
        ownerOrgId: "org-1"
      });
      mockPermissionService.getOrgPermission.mockRejectedValue(new ForbiddenRequestError({ message: "Forbidden" }));

      await expect(
        service.deleteDomainConnector({
          connectorId: "connector-1",
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(ForbiddenRequestError);
    });
  });

  describe("findActiveConnectorByDomain", () => {
    it("should return connector for active + verified domain", async () => {
      const connector = {
        id: "connector-1",
        domain: "company-a.com",
        isActive: true,
        verificationStatus: DomainVerificationStatus.VERIFIED,
        type: AuthMethod.OIDC
      };
      mockDomainSsoConnectorDAL.findOne.mockResolvedValue(connector);

      const result = await service.findActiveConnectorByDomain("company-a.com");

      expect(result).toEqual(connector);
      expect(mockDomainSsoConnectorDAL.findOne).toHaveBeenCalledWith({
        domain: "company-a.com",
        isActive: true,
        verificationStatus: DomainVerificationStatus.VERIFIED
      });
    });

    it("should return null when no active connector exists for domain", async () => {
      mockDomainSsoConnectorDAL.findOne.mockResolvedValue(undefined);

      const result = await service.findActiveConnectorByDomain("no-sso.com");

      expect(result).toBeNull();
    });

    it("should return null for inactive connector", async () => {
      mockDomainSsoConnectorDAL.findOne.mockResolvedValue(undefined);

      const result = await service.findActiveConnectorByDomain("inactive-domain.com");

      expect(result).toBeNull();
    });

    it("should return null for unverified connector", async () => {
      mockDomainSsoConnectorDAL.findOne.mockResolvedValue(undefined);

      const result = await service.findActiveConnectorByDomain("unverified-domain.com");

      expect(result).toBeNull();
    });
  });

  describe("takeoverDomain", () => {
    it("should delete old auth records and create new SSO-typed ones with null externalId", async () => {
      const connector = {
        id: "connector-1",
        domain: "company-a.com",
        ownerOrgId: "org-1",
        type: AuthMethod.OIDC,
        verificationStatus: DomainVerificationStatus.VERIFIED,
        isActive: true
      };
      mockDomainSsoConnectorDAL.findById.mockResolvedValue(connector);

      const existingAuthRecords = [
        { id: "auth-1", userId: "user-1", type: "email", externalId: "alice@company-a.com", domain: "company-a.com" },
        { id: "auth-2", userId: "user-2", type: "google", externalId: "google-123", domain: "company-a.com" }
      ];
      mockUserAuthenticationDAL.find.mockResolvedValue(existingAuthRecords);
      mockUserAuthenticationDAL.delete.mockResolvedValue(existingAuthRecords);
      mockUserAuthenticationDAL.insertMany.mockResolvedValue([]);

      await service.takeoverDomain({
        connectorId: "connector-1",
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null
      });

      // Should delete old records for the domain (with tx)
      expect(mockUserAuthenticationDAL.delete).toHaveBeenCalledWith({ domain: "company-a.com" }, expect.anything());

      // Should create new records with SSO type and null externalId (with tx)
      expect(mockUserAuthenticationDAL.insertMany).toHaveBeenCalledWith(
        [
          { userId: "user-1", type: AuthMethod.OIDC, externalId: null, domain: "company-a.com" },
          { userId: "user-2", type: AuthMethod.OIDC, externalId: null, domain: "company-a.com" }
        ],
        expect.anything()
      );
    });

    it("should throw NotFoundError when connector does not exist", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue(null);

      await expect(
        service.takeoverDomain({
          connectorId: "nonexistent",
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when connector is not verified", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue({
        id: "connector-1",
        domain: "company-a.com",
        ownerOrgId: "org-1",
        verificationStatus: DomainVerificationStatus.PENDING
      });

      await expect(
        service.takeoverDomain({
          connectorId: "connector-1",
          actorId: "user-1",
          actorOrgId: "org-1",
          actorAuthMethod: null
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("should handle domain with no existing auth records gracefully", async () => {
      mockDomainSsoConnectorDAL.findById.mockResolvedValue({
        id: "connector-1",
        domain: "new-domain.com",
        ownerOrgId: "org-1",
        type: AuthMethod.OIDC,
        verificationStatus: DomainVerificationStatus.VERIFIED,
        isActive: true
      });
      mockUserAuthenticationDAL.find.mockResolvedValue([]);
      mockUserAuthenticationDAL.delete.mockResolvedValue([]);

      await service.takeoverDomain({
        connectorId: "connector-1",
        actorId: "user-1",
        actorOrgId: "org-1",
        actorAuthMethod: null
      });

      expect(mockUserAuthenticationDAL.delete).toHaveBeenCalledWith({ domain: "new-domain.com" }, expect.anything());
      expect(mockUserAuthenticationDAL.insertMany).not.toHaveBeenCalled();
    });
  });
});
