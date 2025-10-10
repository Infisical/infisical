/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenError } from "@casl/ability";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { ActorType, AuthMethod } from "../auth/auth-type";
import { TCertificateTemplateV2DALFactory } from "./certificate-template-v2-dal";
import {
  certificateTemplateV2ServiceFactory,
  TCertificateTemplateV2ServiceFactory
} from "./certificate-template-v2-service";
import {
  TCertificateRequest,
  TCertificateTemplateV2,
  TCertificateTemplateV2Insert,
  TTemplateV2Policy
} from "./certificate-template-v2-types";

describe("CertificateTemplateV2Service", () => {
  let service: TCertificateTemplateV2ServiceFactory;

  const mockCertificateTemplateV2DAL = {
    create: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    findByProjectId: vi.fn(),
    countByProjectId: vi.fn(),
    isTemplateInUse: vi.fn(),
    findByNameAndProjectId: vi.fn(),
    transaction: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insertMany: vi.fn(),
    batchInsert: vi.fn(),
    upsert: vi.fn(),
    countDocuments: vi.fn()
  } as any;

  const mockActor = {
    actor: ActorType.USER,
    actorId: "user-123",
    actorAuthMethod: AuthMethod.EMAIL,
    actorOrgId: "org-123"
  };

  const samplePolicy: TTemplateV2Policy = {
    attributes: [
      {
        type: "common_name",
        include: "mandatory",
        value: ["example.com"]
      }
    ],
    keyUsages: {
      requiredUsages: { all: ["digital_signature", "key_encipherment"] },
      optionalUsages: { all: ["data_encipherment"] }
    },
    extendedKeyUsages: {
      requiredUsages: { all: ["server_auth"] },
      optionalUsages: { all: ["client_auth"] }
    },
    subjectAlternativeNames: [
      {
        type: "dns_name",
        include: "optional",
        value: ["example.com", "*.example.com"]
      },
      {
        type: "ip_address",
        include: "mandatory",
        value: ["192.168.1.1"]
      }
    ],
    validity: {
      maxDuration: { value: 90, unit: "days" },
      minDuration: { value: 1, unit: "days" }
    },
    signatureAlgorithm: {
      allowedAlgorithms: ["RSA-SHA256", "ECDSA-SHA256"],
      defaultAlgorithm: "RSA-SHA256"
    },
    keyAlgorithm: {
      allowedKeyTypes: ["RSA-2048", "RSA-4096", "ECDSA-P256"],
      defaultKeyType: "RSA-2048"
    }
  };

  const sampleTemplate: TCertificateTemplateV2 = {
    id: "template-123",
    projectId: "project-123",
    name: "Web Server Template",
    description: "Template for web server certificates",
    ...samplePolicy,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockPermission = {
    can: vi.fn().mockReturnValue(true),
    cannot: vi.fn().mockReturnValue(false),
    relevantRuleFor: vi.fn().mockReturnValue(null),
    rulesFor: vi.fn().mockReturnValue([]),
    rules: [],
    detectSubjectType: vi.fn().mockReturnValue("certificate-templates-v2"),
    modelName: "certificate-templates-v2",
    throwUnlessCan: vi.fn(),
    unlessCan: vi.fn().mockReturnValue({ throwUnlessCan: vi.fn() })
  };

  const mockPermissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({
      permission: mockPermission
    })
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(ForbiddenError, "from").mockReturnValue({
      throwUnlessCan: vi.fn()
    } as any);

    mockPermissionService.getProjectPermission.mockResolvedValue({
      permission: mockPermission
    });

    mockCertificateTemplateV2DAL.findByNameAndProjectId.mockResolvedValue(null);

    service = certificateTemplateV2ServiceFactory({
      certificateTemplateV2DAL: mockCertificateTemplateV2DAL as TCertificateTemplateV2DALFactory,
      permissionService: mockPermissionService
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createTemplateV2", () => {
    const createData: Omit<TCertificateTemplateV2Insert, "projectId"> = {
      name: "Test Template",
      description: "Test description",
      ...samplePolicy
    };

    it("should create template with valid policy", async () => {
      mockCertificateTemplateV2DAL.create.mockResolvedValue(sampleTemplate);

      const result = await service.createTemplateV2({
        ...mockActor,
        projectId: "project-123",
        data: createData
      });

      expect(mockCertificateTemplateV2DAL.create).toHaveBeenCalledWith({
        ...createData,
        projectId: "project-123"
      });
      expect(result).toEqual(sampleTemplate);
    });

    it("should throw error for invalid policy - missing attributes", async () => {
      const invalidData = {
        ...createData,
        attributes: undefined as any
      };

      await expect(
        service.createTemplateV2({
          ...mockActor,
          projectId: "project-123",
          data: invalidData
        })
      ).rejects.toThrow("Template policy must include attributes array");
    });

    it("should throw error for invalid policy - missing key usages", async () => {
      const invalidData = {
        ...createData,
        keyUsages: undefined as any
      };

      await expect(
        service.createTemplateV2({
          ...mockActor,
          projectId: "project-123",
          data: invalidData
        })
      ).rejects.toThrow("Template policy must include valid key usages configuration");
    });

    it("should throw error when default signature algorithm not in allowed list", async () => {
      const invalidData = {
        ...createData,
        signatureAlgorithm: {
          allowedAlgorithms: ["RSA-SHA256"],
          defaultAlgorithm: "ECDSA-SHA256"
        }
      };

      await expect(
        service.createTemplateV2({
          ...mockActor,
          projectId: "project-123",
          data: invalidData
        })
      ).rejects.toThrow("Default signature algorithm must be in allowed algorithms list");
    });

    it("should throw error when default key algorithm not in allowed list", async () => {
      const invalidData = {
        ...createData,
        keyAlgorithm: {
          allowedKeyTypes: ["RSA-2048"],
          defaultKeyType: "RSA-4096"
        }
      };

      await expect(
        service.createTemplateV2({
          ...mockActor,
          projectId: "project-123",
          data: invalidData
        })
      ).rejects.toThrow("Default key algorithm must be in allowed key types list");
    });
  });

  describe("updateTemplateV2", () => {
    it("should update template with valid data", async () => {
      const updateData = { name: "Updated Template Name" };
      const updatedTemplate = { ...sampleTemplate, ...updateData };

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);
      mockCertificateTemplateV2DAL.updateById.mockResolvedValue(updatedTemplate);

      const result = await service.updateTemplateV2({
        ...mockActor,
        templateId: "template-123",
        data: updateData
      });

      expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("template-123");
      expect(mockCertificateTemplateV2DAL.updateById).toHaveBeenCalledWith("template-123", updateData);
      expect(result).toEqual(updatedTemplate);
    });

    it("should throw NotFoundError when template does not exist", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(null);

      await expect(
        service.updateTemplateV2({
          ...mockActor,
          templateId: "nonexistent-template",
          data: { name: "Updated Name" }
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should validate policy when updating policy fields", async () => {
      const invalidPolicyUpdate = {
        signatureAlgorithm: {
          allowedAlgorithms: ["RSA-SHA256"],
          defaultAlgorithm: "INVALID-ALGO"
        }
      };

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);

      await expect(
        service.updateTemplateV2({
          ...mockActor,
          templateId: "template-123",
          data: invalidPolicyUpdate
        })
      ).rejects.toThrow("Default signature algorithm must be in allowed algorithms list");
    });
  });

  describe("getTemplateV2ById", () => {
    it("should return template when found", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);

      const result = await service.getTemplateV2ById({
        ...mockActor,
        templateId: "template-123"
      });

      expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("template-123");
      expect(result).toEqual(sampleTemplate);
    });

    it("should throw NotFoundError when template does not exist", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(null);

      await expect(
        service.getTemplateV2ById({
          ...mockActor,
          templateId: "nonexistent-template"
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("listTemplatesV2", () => {
    it("should return templates list with pagination", async () => {
      const templates = [sampleTemplate];
      const totalCount = 1;

      mockCertificateTemplateV2DAL.findByProjectId.mockResolvedValue(templates);
      mockCertificateTemplateV2DAL.countByProjectId.mockResolvedValue(totalCount);

      const result = await service.listTemplatesV2({
        ...mockActor,
        projectId: "project-123",
        offset: 0,
        limit: 20
      });

      expect(mockCertificateTemplateV2DAL.findByProjectId).toHaveBeenCalledWith("project-123", {
        offset: 0,
        limit: 20,
        search: undefined
      });
      expect(mockCertificateTemplateV2DAL.countByProjectId).toHaveBeenCalledWith("project-123", {
        search: undefined
      });
      expect(result).toEqual({ templates, totalCount });
    });

    it("should handle search parameter", async () => {
      const templates = [sampleTemplate];
      const totalCount = 1;

      mockCertificateTemplateV2DAL.findByProjectId.mockResolvedValue(templates);
      mockCertificateTemplateV2DAL.countByProjectId.mockResolvedValue(totalCount);

      await service.listTemplatesV2({
        ...mockActor,
        projectId: "project-123",
        search: "web server"
      });

      expect(mockCertificateTemplateV2DAL.findByProjectId).toHaveBeenCalledWith("project-123", {
        offset: 0,
        limit: 20,
        search: "web server"
      });
      expect(mockCertificateTemplateV2DAL.countByProjectId).toHaveBeenCalledWith("project-123", {
        search: "web server"
      });
    });
  });

  describe("deleteTemplateV2", () => {
    it("should delete template when not in use", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);
      mockCertificateTemplateV2DAL.isTemplateInUse.mockResolvedValue(false);
      mockCertificateTemplateV2DAL.deleteById.mockResolvedValue(sampleTemplate);

      const result = await service.deleteTemplateV2({
        ...mockActor,
        templateId: "template-123"
      });

      expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("template-123");
      expect(mockCertificateTemplateV2DAL.isTemplateInUse).toHaveBeenCalledWith("template-123");
      expect(mockCertificateTemplateV2DAL.deleteById).toHaveBeenCalledWith("template-123");
      expect(result).toEqual(sampleTemplate);
    });

    it("should throw NotFoundError when template does not exist", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(null);

      await expect(
        service.deleteTemplateV2({
          ...mockActor,
          templateId: "nonexistent-template"
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenRequestError when template is in use", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);
      mockCertificateTemplateV2DAL.isTemplateInUse.mockResolvedValue(true);

      await expect(
        service.deleteTemplateV2({
          ...mockActor,
          templateId: "template-123"
        })
      ).rejects.toThrow(ForbiddenRequestError);
      expect(mockCertificateTemplateV2DAL.deleteById).not.toHaveBeenCalled();
    });
  });

  describe("validateCertificateRequest", () => {
    const validRequest: TCertificateRequest = {
      commonName: "example.com",
      keyUsages: ["digital_signature", "key_encipherment"],
      extendedKeyUsages: ["server_auth"],
      subjectAlternativeNames: [
        { type: "dns_name", value: "example.com" },
        { type: "dns_name", value: "*.example.com" },
        { type: "ip_address", value: "192.168.1.1" }
      ],
      validity: { ttl: "30d" },
      signatureAlgorithm: "RSA-SHA256",
      keyAlgorithm: "RSA-2048"
    };

    beforeEach(() => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);
    });

    it("should validate valid certificate request", async () => {
      const result = await service.validateCertificateRequest("template-123", validRequest);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should throw NotFoundError when template does not exist", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(null);

      await expect(service.validateCertificateRequest("nonexistent-template", validRequest)).rejects.toThrow(
        NotFoundError
      );
    });

    it("should detect missing mandatory attributes", async () => {
      const invalidRequest = { ...validRequest, commonName: undefined };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("common_name is mandatory but not provided in request");
    });

    it("should validate attribute values against allowed list", async () => {
      const invalidRequest = { ...validRequest, commonName: "forbidden.com" };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("common_name value 'forbidden.com' is not in allowed values list");
    });

    it("should detect missing required key usages", async () => {
      const invalidRequest = { ...validRequest, keyUsages: ["digital_signature"] };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Missing required key usages: key_encipherment");
    });

    it("should detect invalid key usages", async () => {
      const invalidRequest = {
        ...validRequest,
        keyUsages: ["digital_signature", "key_encipherment", "invalid_usage"]
      };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid key usages: invalid_usage");
    });

    it("should detect missing required extended key usages", async () => {
      const invalidRequest = { ...validRequest, extendedKeyUsages: [] };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Missing required extended key usages: server_auth");
    });

    it("should detect invalid extended key usages", async () => {
      const invalidRequest = {
        ...validRequest,
        extendedKeyUsages: ["server_auth", "invalid_eku"]
      };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid extended key usages: invalid_eku");
    });

    it("should detect missing mandatory SAN entries", async () => {
      const invalidRequest = { ...validRequest, subjectAlternativeNames: [] };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("ip_address SAN is mandatory but not provided in request");
    });

    it("should validate SAN values against allowed list", async () => {
      const invalidRequest: TCertificateRequest = {
        ...validRequest,
        subjectAlternativeNames: [
          { type: "dns_name", value: "forbidden.com" },
          { type: "ip_address", value: "192.168.1.1" }
        ]
      };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "dns_name SAN value 'forbidden.com' does not match allowed patterns: example.com, *.example.com"
      );
    });

    it("should detect invalid signature algorithm", async () => {
      const invalidRequest = { ...validRequest, signatureAlgorithm: "MD5-RSA" };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Signature algorithm 'MD5-RSA' is not allowed by template policy");
    });

    it("should detect invalid key algorithm", async () => {
      const invalidRequest = { ...validRequest, keyAlgorithm: "RSA-1024" };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Key algorithm 'RSA-1024' is not allowed by template policy");
    });

    it("should detect TTL exceeding maximum duration", async () => {
      const invalidRequest = { ...validRequest, validity: { ttl: "180d" } };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Requested validity period exceeds maximum allowed duration");
    });

    it("should detect TTL below minimum duration", async () => {
      const templateWithMinDuration = {
        ...sampleTemplate,
        validity: {
          maxDuration: { value: 90, unit: "days" as const },
          minDuration: { value: 7, unit: "days" as const }
        }
      };

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithMinDuration);

      const invalidRequest = { ...validRequest, validity: { ttl: "1d" } };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Requested validity period is below minimum required duration");
    });

    it("should handle various TTL formats", async () => {
      const testCases = [
        { ttl: "24h", shouldBeValid: true },
        { ttl: "30d", shouldBeValid: true },
        { ttl: "90d", shouldBeValid: true },
        { ttl: "3m", shouldBeValid: true },
        { ttl: "1y", shouldBeValid: false },
        { ttl: "invalid", shouldThrow: true }
      ];

      for (const testCase of testCases) {
        const request = { ...validRequest, validity: { ttl: testCase.ttl } };

        if (testCase.shouldThrow) {
          await expect(service.validateCertificateRequest("template-123", request)).rejects.toThrow(
            `Invalid TTL format: ${testCase.ttl}`
          );
        } else {
          const result = await service.validateCertificateRequest("template-123", request);
          expect(result.isValid).toBe(testCase.shouldBeValid);
        }
      }
    });

    it("should allow optional key usages and extended key usages", async () => {
      const requestWithOptionalUsages = {
        ...validRequest,
        keyUsages: ["digital_signature", "key_encipherment", "data_encipherment"],
        extendedKeyUsages: ["server_auth", "client_auth"]
      };

      const result = await service.validateCertificateRequest("template-123", requestWithOptionalUsages);

      expect(result.isValid).toBe(true);
    });

    it("should validate wildcard patterns in optional attributes", async () => {
      const wildcardTemplate = {
        ...sampleTemplate,
        attributes: [
          {
            type: "common_name",
            include: "optional" as const,
            value: ["*.example.com", "*.test.com"]
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(wildcardTemplate);

      const requestWithWildcard = {
        ...validRequest,
        commonName: "api.example.com"
      };

      const result = await service.validateCertificateRequest("template-123", requestWithWildcard);
      expect(result.isValid).toBe(true);
    });

    it("should reject wildcard patterns that don't match", async () => {
      const wildcardTemplate = {
        ...sampleTemplate,
        attributes: [
          {
            type: "common_name",
            include: "optional" as const,
            value: ["*.example.com"]
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(wildcardTemplate);

      const requestWithNonMatchingWildcard = {
        ...validRequest,
        commonName: "api.notexample.com"
      };

      const result = await service.validateCertificateRequest("template-123", requestWithNonMatchingWildcard);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "common_name value 'api.notexample.com' does not match allowed patterns: *.example.com"
      );
    });

    it("should allow empty mandatory attributes when no value specified", async () => {
      const emptyMandatoryTemplate = {
        ...sampleTemplate,
        attributes: [
          {
            type: "common_name",
            include: "mandatory" as const,
            value: undefined
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(emptyMandatoryTemplate);

      const requestWithoutCommonName = {
        ...validRequest,
        commonName: undefined
      };

      const result = await service.validateCertificateRequest("template-123", requestWithoutCommonName);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("common_name is mandatory but not provided in request");
    });

    it("should prevent certificates from including prohibited SANs", async () => {
      const prohibitTemplate = {
        ...sampleTemplate,
        subjectAlternativeNames: [
          {
            type: "email" as const,
            include: "prohibit" as const
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(prohibitTemplate);

      const requestWithProhibitedSan = {
        ...validRequest,
        subjectAlternativeNames: [{ type: "email" as const, value: "test@example.com" }]
      };

      const result = await service.validateCertificateRequest("template-123", requestWithProhibitedSan);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("email SAN is prohibited by template policy");
    });

    describe("comprehensive template validation scenarios", () => {
      it("should handle template with minimal required fields only", async () => {
        const minimalTemplate = {
          ...sampleTemplate,
          attributes: [
            {
              type: "common_name",
              include: "mandatory" as const
            }
          ],
          keyUsages: {
            requiredUsages: { all: ["digital_signature"] },
            optionalUsages: { all: [] }
          },
          extendedKeyUsages: {
            requiredUsages: { all: [] },
            optionalUsages: { all: ["server_auth"] }
          },
          subjectAlternativeNames: [],
          validity: {
            maxDuration: { value: 30, unit: "days" as const }
          },
          signatureAlgorithm: undefined,
          keyAlgorithm: undefined
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(minimalTemplate);

        const minimalRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature"],
          validity: { ttl: "15d" }
        };

        const result = await service.validateCertificateRequest("template-123", minimalRequest);
        expect(result.isValid).toBe(true);
      });

      it("should handle template with all fields set to optional", async () => {
        const optionalTemplate = {
          ...sampleTemplate,
          attributes: [
            {
              type: "common_name",
              include: "optional" as const
            },
            {
              type: "organization_name",
              include: "optional" as const
            },
            {
              type: "locality",
              include: "optional" as const
            }
          ],
          keyUsages: {
            requiredUsages: { all: [] },
            optionalUsages: { all: ["digital_signature", "key_encipherment"] }
          },
          extendedKeyUsages: {
            requiredUsages: { all: [] },
            optionalUsages: { all: ["server_auth", "client_auth"] }
          },
          subjectAlternativeNames: [
            {
              type: "dns_name",
              include: "optional" as const
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(optionalTemplate);

        const emptyRequest = {
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", emptyRequest);
        expect(result.isValid).toBe(true);
      });

      it("should handle template with SAN fields prohibited", async () => {
        const prohibitTemplate = {
          ...sampleTemplate,
          attributes: [
            {
              type: "common_name",
              include: "mandatory" as const,
              value: ["example.com"]
            }
          ],
          keyUsages: {
            requiredUsages: { all: ["digital_signature"] },
            optionalUsages: { all: [] }
          },
          extendedKeyUsages: {
            requiredUsages: { all: ["server_auth"] },
            optionalUsages: { all: [] }
          },
          subjectAlternativeNames: [
            {
              type: "email",
              include: "prohibit" as const
            },
            {
              type: "uri",
              include: "prohibit" as const
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(prohibitTemplate);

        const requestWithProhibited = {
          commonName: "example.com",
          keyUsages: ["digital_signature"],
          extendedKeyUsages: ["server_auth"],
          subjectAlternativeNames: [
            { type: "email" as const, value: "test@example.com" },
            { type: "uri" as const, value: "https://example.com" }
          ],
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", requestWithProhibited);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("email SAN is prohibited by template policy");
        expect(result.errors).toContain("uri SAN is prohibited by template policy");
      });

      it("should validate complex attribute value constraints", async () => {
        const constrainedTemplate = {
          ...sampleTemplate,
          attributes: [
            {
              type: "common_name",
              include: "mandatory" as const,
              value: ["example.com", "test.com"]
            }
          ],
          subjectAlternativeNames: [
            {
              type: "dns_name",
              include: "optional" as const,
              value: ["example.com", "*.example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(constrainedTemplate);

        const validConstrainedRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          validity: { ttl: "30d" }
        };

        const validResult = await service.validateCertificateRequest("template-123", validConstrainedRequest);
        expect(validResult.isValid).toBe(true);

        const invalidConstrainedRequest = {
          commonName: "forbidden.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          validity: { ttl: "30d" }
        };

        const invalidResult = await service.validateCertificateRequest("template-123", invalidConstrainedRequest);
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.errors).toContain("common_name value 'forbidden.com' is not in allowed values list");
      });

      it("should validate SAN value constraints with multiple types", async () => {
        const sanTemplate = {
          ...sampleTemplate,
          subjectAlternativeNames: [
            {
              type: "dns_name",
              include: "mandatory" as const,
              value: ["example.com", "test.com"]
            },
            {
              type: "ip_address",
              include: "optional" as const,
              value: ["192.168.1.1", "10.0.0.1"]
            },
            {
              type: "email",
              include: "mandatory" as const,
              value: ["admin@example.com", "test@example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(sanTemplate);

        const validSanRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          subjectAlternativeNames: [
            { type: "dns_name" as const, value: "example.com" },
            { type: "ip_address" as const, value: "192.168.1.1" },
            { type: "email" as const, value: "admin@example.com" }
          ],
          validity: { ttl: "30d" }
        };

        const validResult = await service.validateCertificateRequest("template-123", validSanRequest);
        expect(validResult.isValid).toBe(true);

        const missingSanRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          subjectAlternativeNames: [{ type: "dns_name" as const, value: "example.com" }],
          validity: { ttl: "30d" }
        };

        const missingResult = await service.validateCertificateRequest("template-123", missingSanRequest);
        expect(missingResult.isValid).toBe(false);
        expect(missingResult.errors).toContain("email SAN is mandatory but not provided in request");
      });

      it("should validate key usage combinations thoroughly", async () => {
        const keyUsageTemplate = {
          ...sampleTemplate,
          keyUsages: {
            requiredUsages: { all: ["digital_signature", "key_encipherment"] },
            optionalUsages: { all: ["data_encipherment", "key_agreement"] }
          },
          extendedKeyUsages: {
            requiredUsages: { all: ["server_auth"] },
            optionalUsages: { all: ["client_auth", "email_protection"] }
          },
          subjectAlternativeNames: [
            {
              type: "dns_name",
              include: "optional" as const,
              value: ["example.com", "*.example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(keyUsageTemplate);

        const minimalUsageRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          validity: { ttl: "30d" }
        };

        const minimalResult = await service.validateCertificateRequest("template-123", minimalUsageRequest);
        expect(minimalResult.isValid).toBe(true);

        const extendedUsageRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment", "data_encipherment"],
          extendedKeyUsages: ["server_auth", "client_auth"],
          validity: { ttl: "30d" }
        };

        const extendedResult = await service.validateCertificateRequest("template-123", extendedUsageRequest);
        expect(extendedResult.isValid).toBe(true);

        const forbiddenUsageRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment", "crl_sign"],
          extendedKeyUsages: ["server_auth"],
          validity: { ttl: "30d" }
        };

        const forbiddenResult = await service.validateCertificateRequest("template-123", forbiddenUsageRequest);
        expect(forbiddenResult.isValid).toBe(false);
        expect(forbiddenResult.errors).toContain("Invalid key usages: crl_sign");
      });

      it("should validate algorithm constraints thoroughly", async () => {
        const algorithmTemplate = {
          ...sampleTemplate,
          signatureAlgorithm: {
            allowedAlgorithms: ["RSA-SHA256", "RSA-SHA512"],
            defaultAlgorithm: "RSA-SHA256"
          },
          keyAlgorithm: {
            allowedKeyTypes: ["RSA-2048", "RSA-4096"],
            defaultKeyType: "RSA-2048"
          },
          subjectAlternativeNames: [
            {
              type: "dns_name",
              include: "optional" as const,
              value: ["example.com", "*.example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(algorithmTemplate);

        const validAlgoRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          signatureAlgorithm: "RSA-SHA512",
          keyAlgorithm: "RSA-4096",
          validity: { ttl: "30d" }
        };

        const validResult = await service.validateCertificateRequest("template-123", validAlgoRequest);
        expect(validResult.isValid).toBe(true);

        const invalidSigRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          signatureAlgorithm: "ECDSA-SHA256",
          keyAlgorithm: "RSA-2048",
          validity: { ttl: "30d" }
        };

        const invalidSigResult = await service.validateCertificateRequest("template-123", invalidSigRequest);
        expect(invalidSigResult.isValid).toBe(false);
        expect(invalidSigResult.errors).toContain(
          "Signature algorithm 'ECDSA-SHA256' is not allowed by template policy"
        );

        const invalidKeyRequest = {
          commonName: "example.com",
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          signatureAlgorithm: "RSA-SHA256",
          keyAlgorithm: "ECDSA-P256",
          validity: { ttl: "30d" }
        };

        const invalidKeyResult = await service.validateCertificateRequest("template-123", invalidKeyRequest);
        expect(invalidKeyResult.isValid).toBe(false);
        expect(invalidKeyResult.errors).toContain("Key algorithm 'ECDSA-P256' is not allowed by template policy");
      });

      it("should validate validity period edge cases", async () => {
        const validityTemplate = {
          ...sampleTemplate,
          validity: {
            maxDuration: { value: 365, unit: "days" as const },
            minDuration: { value: 1, unit: "days" as const }
          },
          subjectAlternativeNames: [
            {
              type: "dns_name",
              include: "optional" as const,
              value: ["example.com", "*.example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(validityTemplate);

        const testCases = [
          { ttl: "1d", shouldBeValid: true, description: "minimum duration" },
          { ttl: "365d", shouldBeValid: true, description: "maximum duration" },
          { ttl: "366d", shouldBeValid: false, description: "exceeds maximum" },
          { ttl: "23h", shouldBeValid: false, description: "below minimum" },
          { ttl: "24h", shouldBeValid: true, description: "exactly 1 day in hours" },
          { ttl: "8760h", shouldBeValid: true, description: "exactly 365 days in hours" },
          { ttl: "12m", shouldBeValid: true, description: "exactly 365 days in months" },
          { ttl: "1y", shouldBeValid: true, description: "exactly 365 days in years" }
        ];

        for (const testCase of testCases) {
          const request = {
            commonName: "example.com",
            keyUsages: ["digital_signature", "key_encipherment"],
            extendedKeyUsages: ["server_auth"],
            validity: { ttl: testCase.ttl }
          };

          const result = await service.validateCertificateRequest("template-123", request);
          expect(result.isValid).toBe(testCase.shouldBeValid);

          if (!testCase.shouldBeValid) {
            expect(result.errors.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe("algorithm validation", () => {
      it("should validate signature algorithm constraints", async () => {
        const algorithmTemplate = {
          ...sampleTemplate,
          signatureAlgorithm: {
            allowedAlgorithms: ["RSA-SHA256", "RSA-SHA512", "ECDSA-SHA256"],
            defaultAlgorithm: "RSA-SHA256"
          },
          keyAlgorithm: {
            allowedKeyTypes: ["RSA_2048", "RSA_4096", "ECDSA_P256"],
            defaultKeyType: "RSA_2048"
          }
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(algorithmTemplate);

        const testCases = [
          {
            signatureAlgorithm: "RSA-SHA256",
            keyAlgorithm: "RSA_2048",
            shouldBeValid: true,
            description: "allowed algorithms"
          },
          {
            signatureAlgorithm: "RSA-SHA512",
            keyAlgorithm: "RSA_4096",
            shouldBeValid: true,
            description: "different allowed algorithms"
          },
          {
            signatureAlgorithm: "ECDSA-SHA256",
            keyAlgorithm: "ECDSA_P256",
            shouldBeValid: true,
            description: "ECDSA algorithms"
          },
          {
            signatureAlgorithm: "MD5-RSA",
            keyAlgorithm: "RSA_2048",
            shouldBeValid: false,
            description: "disallowed signature algorithm"
          },
          {
            signatureAlgorithm: "RSA-SHA256",
            keyAlgorithm: "RSA_1024",
            shouldBeValid: false,
            description: "disallowed key algorithm"
          },
          {
            signatureAlgorithm: undefined,
            keyAlgorithm: undefined,
            shouldBeValid: true,
            description: "no algorithms specified (should use defaults)"
          }
        ];

        for (const testCase of testCases) {
          const request = {
            commonName: "example.com",
            validity: { ttl: "30d" },
            keyUsages: ["digital_signature", "key_encipherment"],
            extendedKeyUsages: ["server_auth"],
            subjectAlternativeNames: [{ type: "ip_address" as const, value: "192.168.1.1" }],
            signatureAlgorithm: testCase.signatureAlgorithm,
            keyAlgorithm: testCase.keyAlgorithm
          };

          const result = await service.validateCertificateRequest("template-123", request);

          expect(result.isValid).toBe(testCase.shouldBeValid);

          if (!testCase.shouldBeValid) {
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some((error) => error.includes("algorithm") || error.includes("Algorithm"))).toBe(
              true
            );
          }
        }
      });

      it("should validate when no algorithm constraints are defined", async () => {
        const templateWithoutAlgorithms = {
          ...sampleTemplate,
          signatureAlgorithm: undefined,
          keyAlgorithm: undefined
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithoutAlgorithms);

        const request = {
          commonName: "example.com",
          validity: { ttl: "30d" },
          keyUsages: ["digital_signature", "key_encipherment"],
          extendedKeyUsages: ["server_auth"],
          subjectAlternativeNames: [{ type: "ip_address" as const, value: "192.168.1.1" }],
          signatureAlgorithm: "RSA-SHA256",
          keyAlgorithm: "RSA_2048"
        };

        const result = await service.validateCertificateRequest("template-123", request);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
});
