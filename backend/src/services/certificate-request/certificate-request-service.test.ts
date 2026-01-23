/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateServiceFactory } from "@app/services/certificate/certificate-service";

import { TCertificateRequestDALFactory } from "./certificate-request-dal";
import { certificateRequestServiceFactory, TCertificateRequestServiceFactory } from "./certificate-request-service";
import { CertificateRequestStatus } from "./certificate-request-types";

describe("CertificateRequestService", () => {
  let service: TCertificateRequestServiceFactory;

  const mockCertificateRequestDAL: Pick<
    TCertificateRequestDALFactory,
    "create" | "findById" | "findByIdWithCertificate" | "updateStatus" | "attachCertificate"
  > = {
    create: vi.fn() as any,
    findById: vi.fn() as any,
    findByIdWithCertificate: vi.fn() as any,
    updateStatus: vi.fn() as any,
    attachCertificate: vi.fn() as any
  };

  const mockCertificateDAL: Pick<TCertificateDALFactory, "findById"> = {
    findById: vi.fn() as any
  };

  const mockCertificateService: Pick<TCertificateServiceFactory, "getCertBody" | "getCertPrivateKey"> = {
    getCertBody: vi.fn() as any,
    getCertPrivateKey: vi.fn() as any
  };

  const mockPermissionService: Pick<TPermissionServiceFactory, "getProjectPermission"> = {
    getProjectPermission: vi.fn() as any
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = certificateRequestServiceFactory({
      certificateRequestDAL: mockCertificateRequestDAL as TCertificateRequestDALFactory,
      certificateDAL: mockCertificateDAL,
      certificateService: mockCertificateService,
      permissionService: mockPermissionService
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createCertificateRequest", () => {
    const mockCreateData = {
      actor: ActorType.USER,
      actorId: "550e8400-e29b-41d4-a716-446655440001",
      actorAuthMethod: AuthMethod.EMAIL,
      actorOrgId: "550e8400-e29b-41d4-a716-446655440002",
      projectId: "550e8400-e29b-41d4-a716-446655440003",
      profileId: "550e8400-e29b-41d4-a716-446655440004",
      commonName: "test.example.com",
      status: CertificateRequestStatus.PENDING
    };

    it("should create certificate request successfully", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateProfileActions.IssueCert,
            subject: ProjectPermissionSub.CertificateProfiles
          }
        ])
      };
      const mockCreatedRequest = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        status: CertificateRequestStatus.PENDING,
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        profileId: "550e8400-e29b-41d4-a716-446655440004",
        commonName: "test.example.com"
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.create as any).mockResolvedValue(mockCreatedRequest);

      const result = await service.createCertificateRequest(mockCreateData);

      expect(mockPermissionService.getProjectPermission).toHaveBeenCalledWith({
        actor: ActorType.USER,
        actorId: "550e8400-e29b-41d4-a716-446655440001",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "550e8400-e29b-41d4-a716-446655440002",
        actionProjectType: ActionProjectType.CertificateManager
      });
      expect(mockCertificateRequestDAL.create).toHaveBeenCalledWith(
        {
          status: CertificateRequestStatus.PENDING,
          projectId: "550e8400-e29b-41d4-a716-446655440003",
          profileId: "550e8400-e29b-41d4-a716-446655440004",
          commonName: "test.example.com"
        },
        undefined
      );
      expect(result).toEqual(mockCreatedRequest);
    });

    it("should throw ForbiddenError when user lacks permission", async () => {
      const mockPermission = {
        permission: ForbiddenError.from(createMongoAbility([]))
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);

      await expect(service.createCertificateRequest(mockCreateData)).rejects.toThrow();
    });
  });

  describe("getCertificateRequest", () => {
    const mockGetData = {
      actor: ActorType.USER,
      actorId: "550e8400-e29b-41d4-a716-446655440001",
      actorAuthMethod: AuthMethod.EMAIL,
      actorOrgId: "550e8400-e29b-41d4-a716-446655440002",
      projectId: "550e8400-e29b-41d4-a716-446655440003",
      certificateRequestId: "550e8400-e29b-41d4-a716-446655440005"
    };

    it("should get certificate request successfully", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };
      const mockRequest = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        status: CertificateRequestStatus.PENDING
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findById as any).mockResolvedValue(mockRequest);

      const result = await service.getCertificateRequest(mockGetData);

      expect(mockPermissionService.getProjectPermission).toHaveBeenCalledWith({
        actor: ActorType.USER,
        actorId: "550e8400-e29b-41d4-a716-446655440001",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "550e8400-e29b-41d4-a716-446655440002",
        actionProjectType: ActionProjectType.CertificateManager
      });
      expect(mockCertificateRequestDAL.findById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440005");
      expect(result).toEqual(mockRequest);
    });

    it("should throw NotFoundError when certificate request does not exist", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findById as any).mockResolvedValue(null);

      await expect(service.getCertificateRequest(mockGetData)).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError when certificate request belongs to different project", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };
      const mockRequest = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        projectId: "550e8400-e29b-41d4-a716-446655440099",
        status: CertificateRequestStatus.PENDING
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findById as any).mockResolvedValue(mockRequest);

      await expect(service.getCertificateRequest(mockGetData)).rejects.toThrow(NotFoundError);
    });
  });

  describe("getCertificateFromRequest", () => {
    const mockGetData = {
      actor: ActorType.USER,
      actorId: "550e8400-e29b-41d4-a716-446655440001",
      actorAuthMethod: AuthMethod.EMAIL,
      actorOrgId: "550e8400-e29b-41d4-a716-446655440002",
      projectId: "550e8400-e29b-41d4-a716-446655440003",
      certificateRequestId: "550e8400-e29b-41d4-a716-446655440005"
    };

    it("should get certificate from request successfully when certificate is attached", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          },
          {
            action: ProjectPermissionCertificateActions.ReadPrivateKey,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };
      const mockCertificate = {
        id: "550e8400-e29b-41d4-a716-446655440006",
        serialNumber: "123456",
        commonName: "test.example.com"
      };
      const mockRequestWithCert = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        status: CertificateRequestStatus.ISSUED,
        certificate: mockCertificate,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const mockCertBody = {
        certificate: "-----BEGIN CERTIFICATE-----\nMOCK_CERT_PEM\n-----END CERTIFICATE-----"
      };
      const mockPrivateKey = {
        certPrivateKey: "-----BEGIN PRIVATE KEY-----\nMOCK_KEY_PEM\n-----END PRIVATE KEY-----"
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findByIdWithCertificate as any).mockResolvedValue(mockRequestWithCert);
      (mockCertificateService.getCertBody as any).mockResolvedValue(mockCertBody);
      (mockCertificateService.getCertPrivateKey as any).mockResolvedValue(mockPrivateKey);

      const { certificateRequest, projectId } = await service.getCertificateFromRequest(mockGetData);

      expect(mockCertificateRequestDAL.findByIdWithCertificate).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440005"
      );
      expect(mockCertificateService.getCertBody).toHaveBeenCalledWith({
        id: "550e8400-e29b-41d4-a716-446655440006",
        actor: ActorType.USER,
        actorId: "550e8400-e29b-41d4-a716-446655440001",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "550e8400-e29b-41d4-a716-446655440002"
      });
      expect(mockCertificateService.getCertPrivateKey).toHaveBeenCalledWith({
        id: "550e8400-e29b-41d4-a716-446655440006",
        actor: ActorType.USER,
        actorId: "550e8400-e29b-41d4-a716-446655440001",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "550e8400-e29b-41d4-a716-446655440002"
      });
      expect(certificateRequest).toEqual({
        status: CertificateRequestStatus.ISSUED,
        certificateId: "550e8400-e29b-41d4-a716-446655440006",
        certificate: "-----BEGIN CERTIFICATE-----\nMOCK_CERT_PEM\n-----END CERTIFICATE-----",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMOCK_KEY_PEM\n-----END PRIVATE KEY-----",
        serialNumber: "123456",
        errorMessage: null,
        createdAt: mockRequestWithCert.createdAt,
        updatedAt: mockRequestWithCert.updatedAt
      });
      expect(projectId).toEqual("550e8400-e29b-41d4-a716-446655440003");
    });

    it("should get certificate from request successfully when no certificate is attached", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };
      const mockRequestWithoutCert = {
        id: "550e8400-e29b-41d4-a716-446655440007",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        status: CertificateRequestStatus.PENDING,
        certificate: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findByIdWithCertificate as any).mockResolvedValue(mockRequestWithoutCert);

      const { certificateRequest, projectId } = await service.getCertificateFromRequest(mockGetData);

      expect(certificateRequest).toEqual({
        status: CertificateRequestStatus.PENDING,
        certificateId: null,
        certificate: null,
        privateKey: null,
        serialNumber: null,
        errorMessage: null,
        createdAt: mockRequestWithoutCert.createdAt,
        updatedAt: mockRequestWithoutCert.updatedAt
      });
      expect(projectId).toEqual("550e8400-e29b-41d4-a716-446655440003");
    });

    it("should get certificate from request successfully when user lacks private key permission", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };
      const mockCertificate = {
        id: "550e8400-e29b-41d4-a716-446655440008",
        serialNumber: "123456",
        commonName: "test.example.com"
      };
      const mockRequestWithCert = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        status: CertificateRequestStatus.ISSUED,
        certificate: mockCertificate,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const mockCertBody = {
        certificate: "-----BEGIN CERTIFICATE-----\nMOCK_CERT_PEM\n-----END CERTIFICATE-----"
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findByIdWithCertificate as any).mockResolvedValue(mockRequestWithCert);
      (mockCertificateService.getCertBody as any).mockResolvedValue(mockCertBody);

      const { certificateRequest, projectId } = await service.getCertificateFromRequest(mockGetData);

      expect(mockCertificateRequestDAL.findByIdWithCertificate).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440005"
      );
      expect(mockCertificateService.getCertBody).toHaveBeenCalledWith({
        id: "550e8400-e29b-41d4-a716-446655440008",
        actor: ActorType.USER,
        actorId: "550e8400-e29b-41d4-a716-446655440001",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "550e8400-e29b-41d4-a716-446655440002"
      });
      expect(mockCertificateService.getCertPrivateKey).not.toHaveBeenCalled();
      expect(certificateRequest).toEqual({
        status: CertificateRequestStatus.ISSUED,
        certificateId: "550e8400-e29b-41d4-a716-446655440008",
        certificate: "-----BEGIN CERTIFICATE-----\nMOCK_CERT_PEM\n-----END CERTIFICATE-----",
        privateKey: null,
        serialNumber: "123456",
        errorMessage: null,
        createdAt: mockRequestWithCert.createdAt,
        updatedAt: mockRequestWithCert.updatedAt
      });
      expect(projectId).toEqual("550e8400-e29b-41d4-a716-446655440003");
    });

    it("should get certificate from request successfully when user has private key permission but key retrieval fails", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          },
          {
            action: ProjectPermissionCertificateActions.ReadPrivateKey,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };
      const mockCertificate = {
        id: "550e8400-e29b-41d4-a716-446655440009",
        serialNumber: "123456",
        commonName: "test.example.com"
      };
      const mockRequestWithCert = {
        id: "550e8400-e29b-41d4-a716-446655440005",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        status: CertificateRequestStatus.ISSUED,
        certificate: mockCertificate,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const mockCertBody = {
        certificate: "-----BEGIN CERTIFICATE-----\nMOCK_CERT_PEM\n-----END CERTIFICATE-----"
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findByIdWithCertificate as any).mockResolvedValue(mockRequestWithCert);
      (mockCertificateService.getCertBody as any).mockResolvedValue(mockCertBody);
      (mockCertificateService.getCertPrivateKey as any).mockRejectedValue(new Error("Private key not found"));

      const { certificateRequest, projectId } = await service.getCertificateFromRequest(mockGetData);

      expect(mockCertificateRequestDAL.findByIdWithCertificate).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440005"
      );
      expect(mockCertificateService.getCertBody).toHaveBeenCalledWith({
        id: "550e8400-e29b-41d4-a716-446655440009",
        actor: ActorType.USER,
        actorId: "550e8400-e29b-41d4-a716-446655440001",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "550e8400-e29b-41d4-a716-446655440002"
      });
      expect(mockCertificateService.getCertPrivateKey).toHaveBeenCalledWith({
        id: "550e8400-e29b-41d4-a716-446655440009",
        actor: ActorType.USER,
        actorId: "550e8400-e29b-41d4-a716-446655440001",
        actorAuthMethod: AuthMethod.EMAIL,
        actorOrgId: "550e8400-e29b-41d4-a716-446655440002"
      });
      expect(certificateRequest).toEqual({
        status: CertificateRequestStatus.ISSUED,
        certificateId: "550e8400-e29b-41d4-a716-446655440009",
        certificate: "-----BEGIN CERTIFICATE-----\nMOCK_CERT_PEM\n-----END CERTIFICATE-----",
        privateKey: null,
        serialNumber: "123456",
        errorMessage: null,
        createdAt: mockRequestWithCert.createdAt,
        updatedAt: mockRequestWithCert.updatedAt
      });
      expect(projectId).toEqual("550e8400-e29b-41d4-a716-446655440003");
    });

    it("should get certificate from request with error message when failed", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };
      const mockFailedRequest = {
        id: "550e8400-e29b-41d4-a716-446655440010",
        projectId: "550e8400-e29b-41d4-a716-446655440003",
        status: CertificateRequestStatus.FAILED,
        certificate: null,
        errorMessage: "Certificate issuance failed",
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findByIdWithCertificate as any).mockResolvedValue(mockFailedRequest);

      const { certificateRequest, projectId } = await service.getCertificateFromRequest(mockGetData);

      expect(certificateRequest).toEqual({
        status: CertificateRequestStatus.FAILED,
        certificate: null,
        certificateId: null,
        privateKey: null,
        serialNumber: null,
        errorMessage: "Certificate issuance failed",
        createdAt: mockFailedRequest.createdAt,
        updatedAt: mockFailedRequest.updatedAt
      });
      expect(projectId).toEqual("550e8400-e29b-41d4-a716-446655440003");
    });

    it("should throw NotFoundError when certificate request does not exist", async () => {
      const mockPermission = {
        permission: createMongoAbility<ProjectPermissionSet>([
          {
            action: ProjectPermissionCertificateActions.Read,
            subject: ProjectPermissionSub.Certificates
          }
        ])
      };

      (mockPermissionService.getProjectPermission as any).mockResolvedValue(mockPermission);
      (mockCertificateRequestDAL.findByIdWithCertificate as any).mockResolvedValue(null);

      await expect(service.getCertificateFromRequest(mockGetData)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateCertificateRequestStatus", () => {
    it("should update certificate request status successfully", async () => {
      const mockRequest = {
        id: "550e8400-e29b-41d4-a716-446655440011",
        status: CertificateRequestStatus.PENDING
      };
      const mockUpdatedRequest = {
        id: "550e8400-e29b-41d4-a716-446655440011",
        status: CertificateRequestStatus.ISSUED
      };

      (mockCertificateRequestDAL.findById as any).mockResolvedValue(mockRequest);
      (mockCertificateRequestDAL.updateStatus as any).mockResolvedValue(mockUpdatedRequest);

      const result = await service.updateCertificateRequestStatus({
        certificateRequestId: "550e8400-e29b-41d4-a716-446655440011",
        status: CertificateRequestStatus.ISSUED
      });

      expect(mockCertificateRequestDAL.findById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440011");
      expect(mockCertificateRequestDAL.updateStatus).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440011",
        CertificateRequestStatus.ISSUED,
        undefined
      );
      expect(result).toEqual(mockUpdatedRequest);
    });

    it("should update certificate request status with error message", async () => {
      const mockRequest = {
        id: "550e8400-e29b-41d4-a716-446655440012",
        status: CertificateRequestStatus.PENDING
      };
      const mockUpdatedRequest = {
        id: "550e8400-e29b-41d4-a716-446655440012",
        status: CertificateRequestStatus.FAILED
      };

      (mockCertificateRequestDAL.findById as any).mockResolvedValue(mockRequest);
      (mockCertificateRequestDAL.updateStatus as any).mockResolvedValue(mockUpdatedRequest);

      const result = await service.updateCertificateRequestStatus({
        certificateRequestId: "550e8400-e29b-41d4-a716-446655440012",
        status: CertificateRequestStatus.FAILED,
        errorMessage: "Certificate issuance failed"
      });

      expect(mockCertificateRequestDAL.updateStatus).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440012",
        CertificateRequestStatus.FAILED,
        "Certificate issuance failed"
      );
      expect(result).toEqual(mockUpdatedRequest);
    });

    it("should throw NotFoundError when certificate request does not exist", async () => {
      (mockCertificateRequestDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.updateCertificateRequestStatus({
          certificateRequestId: "550e8400-e29b-41d4-a716-446655440013",
          status: CertificateRequestStatus.ISSUED
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("attachCertificateToRequest", () => {
    it("should attach certificate to request successfully", async () => {
      const mockRequest = {
        id: "550e8400-e29b-41d4-a716-446655440014",
        status: CertificateRequestStatus.PENDING
      };
      const mockCertificate = {
        id: "550e8400-e29b-41d4-a716-446655440015"
      };
      const mockUpdatedRequest = {
        id: "550e8400-e29b-41d4-a716-446655440014",
        status: CertificateRequestStatus.ISSUED,
        certificateId: "550e8400-e29b-41d4-a716-446655440015"
      };

      (mockCertificateRequestDAL.findById as any).mockResolvedValue(mockRequest);
      (mockCertificateDAL.findById as any).mockResolvedValue(mockCertificate);
      (mockCertificateRequestDAL.attachCertificate as any).mockResolvedValue(mockUpdatedRequest);

      const result = await service.attachCertificateToRequest({
        certificateRequestId: "550e8400-e29b-41d4-a716-446655440014",
        certificateId: "550e8400-e29b-41d4-a716-446655440015"
      });

      expect(mockCertificateRequestDAL.findById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440014");
      expect(mockCertificateDAL.findById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440015");
      expect(mockCertificateRequestDAL.attachCertificate).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440014",
        "550e8400-e29b-41d4-a716-446655440015"
      );
      expect(result).toEqual(mockUpdatedRequest);
    });

    it("should throw NotFoundError when certificate request does not exist", async () => {
      (mockCertificateRequestDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.attachCertificateToRequest({
          certificateRequestId: "550e8400-e29b-41d4-a716-446655440016",
          certificateId: "550e8400-e29b-41d4-a716-446655440017"
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw NotFoundError when certificate does not exist", async () => {
      const mockRequest = {
        id: "550e8400-e29b-41d4-a716-446655440018",
        status: CertificateRequestStatus.PENDING
      };

      (mockCertificateRequestDAL.findById as any).mockResolvedValue(mockRequest);
      (mockCertificateDAL.findById as any).mockResolvedValue(null);

      await expect(
        service.attachCertificateToRequest({
          certificateRequestId: "550e8400-e29b-41d4-a716-446655440018",
          certificateId: "550e8400-e29b-41d4-a716-446655440019"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
