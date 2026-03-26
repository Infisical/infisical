import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TUserAuthenticationServiceFactory, userAuthenticationServiceFactory } from "./user-authentication-service";
import { UserAuthenticationType } from "./user-authentication-types";

const mockUserAuthenticationDAL = {
  create: vi.fn(),
  findOne: vi.fn(),
  findById: vi.fn(),
  deleteById: vi.fn(),
  updateById: vi.fn(),
  findByUserId: vi.fn(),
  findByExternalIdAndType: vi.fn()
};

describe("UserAuthenticationService", () => {
  let service: TUserAuthenticationServiceFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    service = userAuthenticationServiceFactory({
      userAuthenticationDAL: mockUserAuthenticationDAL as never
    });
  });

  describe("createAuthentication", () => {
    it("should create a record for an email user", async () => {
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue(null);
      mockUserAuthenticationDAL.create.mockImplementation((data: Record<string, unknown>) => ({
        id: "auth-1",
        ...data
      }));

      const result = await service.createAuthentication({
        userId: "user-1",
        type: UserAuthenticationType.EMAIL,
        externalId: "tre@company-a.com",
        domain: "company-a.com"
      });

      expect(mockUserAuthenticationDAL.create).toHaveBeenCalledWith({
        userId: "user-1",
        type: UserAuthenticationType.EMAIL,
        externalId: "tre@company-a.com",
        domain: "company-a.com"
      });
      expect(result.type).toBe(UserAuthenticationType.EMAIL);
    });

    it("should create a record for an OIDC user", async () => {
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue(null);
      mockUserAuthenticationDAL.create.mockImplementation((data: Record<string, unknown>) => ({
        id: "auth-2",
        ...data
      }));

      const result = await service.createAuthentication({
        userId: "user-2",
        type: UserAuthenticationType.OIDC,
        externalId: "okta-subject-12345",
        domain: "company-a.com"
      });

      expect(mockUserAuthenticationDAL.create).toHaveBeenCalledWith({
        userId: "user-2",
        type: UserAuthenticationType.OIDC,
        externalId: "okta-subject-12345",
        domain: "company-a.com"
      });
      expect(result.type).toBe(UserAuthenticationType.OIDC);
    });

    it("should throw BadRequestError when user already has an auth record", async () => {
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue({
        id: "existing-auth",
        userId: "user-1",
        type: UserAuthenticationType.EMAIL
      });

      await expect(
        service.createAuthentication({
          userId: "user-1",
          type: UserAuthenticationType.GOOGLE,
          externalId: "google-id-123",
          domain: "gmail.com"
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("switchAuthentication", () => {
    it("should replace auth record for social login linking", async () => {
      const existingAuth = {
        id: "auth-1",
        userId: "user-1",
        type: UserAuthenticationType.EMAIL,
        externalId: "tre@gmail.com",
        domain: "gmail.com"
      };
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue(existingAuth);
      mockUserAuthenticationDAL.deleteById.mockResolvedValue(existingAuth);
      mockUserAuthenticationDAL.create.mockImplementation((data: Record<string, unknown>) => ({
        id: "auth-2",
        ...data
      }));

      const result = await service.switchAuthentication({
        userId: "user-1",
        type: UserAuthenticationType.GOOGLE,
        externalId: "google-id-123",
        domain: "gmail.com"
      });

      expect(mockUserAuthenticationDAL.deleteById).toHaveBeenCalledWith("auth-1");
      expect(mockUserAuthenticationDAL.create).toHaveBeenCalledWith({
        userId: "user-1",
        type: UserAuthenticationType.GOOGLE,
        externalId: "google-id-123",
        domain: "gmail.com"
      });
      expect(result.type).toBe(UserAuthenticationType.GOOGLE);
    });

    it("should throw NotFoundError when no existing auth record", async () => {
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue(null);

      await expect(
        service.switchAuthentication({
          userId: "user-1",
          type: UserAuthenticationType.GOOGLE,
          externalId: "google-id-123",
          domain: "gmail.com"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("getByUserId", () => {
    it("should return auth record for a user", async () => {
      const auth = {
        id: "auth-1",
        userId: "user-1",
        type: UserAuthenticationType.EMAIL,
        externalId: "tre@company-a.com",
        domain: "company-a.com"
      };
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue(auth);

      const result = await service.getByUserId("user-1");

      expect(result).toEqual(auth);
      expect(mockUserAuthenticationDAL.findByUserId).toHaveBeenCalledWith("user-1");
    });

    it("should return null when no auth record exists", async () => {
      mockUserAuthenticationDAL.findByUserId.mockResolvedValue(null);

      const result = await service.getByUserId("user-1");

      expect(result).toBeNull();
    });
  });

  describe("getByExternalIdAndType", () => {
    it("should find user by OIDC external ID", async () => {
      const auth = {
        id: "auth-1",
        userId: "user-1",
        type: UserAuthenticationType.OIDC,
        externalId: "okta-subject-12345",
        domain: "company-a.com"
      };
      mockUserAuthenticationDAL.findByExternalIdAndType.mockResolvedValue(auth);

      const result = await service.getByExternalIdAndType("okta-subject-12345", UserAuthenticationType.OIDC);

      expect(result).toEqual(auth);
      expect(mockUserAuthenticationDAL.findByExternalIdAndType).toHaveBeenCalledWith(
        "okta-subject-12345",
        UserAuthenticationType.OIDC
      );
    });

    it("should return null when no match found", async () => {
      mockUserAuthenticationDAL.findByExternalIdAndType.mockResolvedValue(null);

      const result = await service.getByExternalIdAndType("nonexistent", UserAuthenticationType.OIDC);

      expect(result).toBeNull();
    });
  });
});
