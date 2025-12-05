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
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "../certificate-common/certificate-constants";
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

enum CertAttributeRule {
  ALLOW = "allow",
  DENY = "deny",
  REQUIRE = "require"
}

describe("CertificateTemplateV2Service", () => {
  let service: TCertificateTemplateV2ServiceFactory;

  const mockCertificateTemplateV2DAL = {
    findBySlugAndProjectId: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    updateById: vi.fn(),
    deleteById: vi.fn(),
    findByProjectId: vi.fn(),
    countByProjectId: vi.fn(),
    isTemplateInUse: vi.fn(),
    getProfilesUsingTemplate: vi.fn(),
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
    subject: [
      {
        type: CertSubjectAttributeType.COMMON_NAME,
        allowed: ["*.example.com", "example.com"]
      },
      {
        type: CertSubjectAttributeType.ORGANIZATION,
        allowed: ["Example Inc", "Example Corp"],
        denied: ["Malicious Corp"]
      }
    ],
    sans: [
      {
        type: CertSubjectAlternativeNameType.DNS_NAME,
        allowed: ["*.example.com", "*.api.example.com"],
        required: ["api.example.com"]
      },
      {
        type: CertSubjectAlternativeNameType.EMAIL,
        required: ["admin@example.com"],
        denied: ["blocked@example.com"]
      }
    ],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
      allowed: [CertKeyUsageType.DATA_ENCIPHERMENT]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.SERVER_AUTH],
      allowed: [CertExtendedKeyUsageType.CLIENT_AUTH]
    },
    validity: {
      max: "90d"
    },
    algorithms: {
      signature: ["SHA256-RSA", "SHA256-ECDSA"],
      keyAlgorithm: ["RSA-2048", "RSA-4096", "ECDSA-P256"]
    }
  };

  const sampleTemplate: TCertificateTemplateV2 = {
    id: "template-123",
    projectId: "project-123",
    name: "web-server-template",
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
    mockCertificateTemplateV2DAL.findBySlugAndProjectId.mockResolvedValue(null);

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
      name: "test-template",
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
        projectId: "project-123",
        name: expect.any(String)
      });
      expect(result).toEqual(sampleTemplate);
    });

    // Previously tested service-level validations that are now schema-level:
    // - Missing attributes validation (now mandatory in schema)
    // - Missing key usages validation (now mandatory in schema)
    // - Default signature algorithm not in allowed list (now schema-level validation)
    // - Default key algorithm not in allowed list (now schema-level validation)
  });

  describe("updateTemplateV2", () => {
    it("should update template with valid data", async () => {
      const updateData = { name: "updated-template-name" };
      const updatedTemplate = { ...sampleTemplate, ...updateData };

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);
      mockCertificateTemplateV2DAL.updateById.mockResolvedValue(updatedTemplate);

      const result = await service.updateTemplateV2({
        ...mockActor,
        templateId: "template-123",
        data: updateData
      });

      expect(mockCertificateTemplateV2DAL.findById).toHaveBeenCalledWith("template-123");
      expect(mockCertificateTemplateV2DAL.updateById).toHaveBeenCalledWith("template-123", {
        ...updateData,
        name: expect.any(String)
      });
      expect(result).toEqual(updatedTemplate);
    });

    it("should throw NotFoundError when template does not exist", async () => {
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(null);

      await expect(
        service.updateTemplateV2({
          ...mockActor,
          templateId: "nonexistent-template",
          data: { name: "updated-name" }
        })
      ).rejects.toThrow(NotFoundError);
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

      expect(mockCertificateTemplateV2DAL.findByProjectId).toHaveBeenCalledWith(
        "project-123",
        {
          offset: 0,
          limit: 20,
          search: undefined
        },
        { allowRules: [], forbidRules: [] }
      );
      expect(mockCertificateTemplateV2DAL.countByProjectId).toHaveBeenCalledWith(
        "project-123",
        {
          search: undefined
        },
        { allowRules: [], forbidRules: [] }
      );
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

      expect(mockCertificateTemplateV2DAL.findByProjectId).toHaveBeenCalledWith(
        "project-123",
        {
          offset: 0,
          limit: 20,
          search: "web server"
        },
        { allowRules: [], forbidRules: [] }
      );
      expect(mockCertificateTemplateV2DAL.countByProjectId).toHaveBeenCalledWith(
        "project-123",
        {
          search: "web server"
        },
        { allowRules: [], forbidRules: [] }
      );
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
      const mockProfiles = [
        { id: "profile-1", slug: "web-server-profile", description: "Web server certificate profile" },
        { id: "profile-2", slug: "api-gateway-profile", description: "API gateway certificate profile" }
      ];

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(sampleTemplate);
      mockCertificateTemplateV2DAL.isTemplateInUse.mockResolvedValue(true);
      mockCertificateTemplateV2DAL.getProfilesUsingTemplate.mockResolvedValue(mockProfiles);

      await expect(
        service.deleteTemplateV2({
          ...mockActor,
          templateId: "template-123"
        })
      ).rejects.toThrow(ForbiddenRequestError);

      expect(mockCertificateTemplateV2DAL.getProfilesUsingTemplate).toHaveBeenCalledWith("template-123");
      expect(mockCertificateTemplateV2DAL.deleteById).not.toHaveBeenCalled();
    });
  });

  describe("validateCertificateRequest", () => {
    const validRequest: TCertificateRequest = {
      commonName: "api.example.com",
      organization: "Example Inc",
      keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
      extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
      subjectAlternativeNames: [
        { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
        { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" }
      ],
      validity: { ttl: "30d" },
      signatureAlgorithm: "RSA-SHA256",
      keyAlgorithm: "RSA_2048"
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

    it("should validate allowed attribute values against pattern", async () => {
      const result = await service.validateCertificateRequest("template-123", validRequest);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect attribute values that don't match allowed patterns", async () => {
      const invalidRequest = { ...validRequest, commonName: "forbidden.com" };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "common_name value 'forbidden.com' does not match allowed patterns: *.example.com, example.com"
      );
    });

    it("should detect denied attribute values", async () => {
      const templateWithDeny = {
        ...sampleTemplate,
        subject: [
          ...sampleTemplate.subject!,
          {
            type: CertSubjectAttributeType.ORGANIZATION,
            denied: ["Forbidden Corp"]
          }
        ]
      };

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithDeny);

      const invalidRequest = { ...validRequest, organization: "Forbidden Corp" };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("organization value 'Forbidden Corp' is denied by template policy");
    });

    it("should detect missing required key usages", async () => {
      const invalidRequest = { ...validRequest, keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE] };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Missing required key usages: key_encipherment");
    });

    it("should detect invalid key usages", async () => {
      const invalidRequest = {
        ...validRequest,
        keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT, "invalid_usage"] as any
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
        extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH, "invalid_eku"] as any
      };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid extended key usages: invalid_eku");
    });

    it("should detect missing required SAN entries", async () => {
      const invalidRequest = {
        ...validRequest,
        subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" }]
      };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Required email SAN matching pattern 'admin@example.com' not found in request");
    });

    it("should validate SAN values against allowed patterns", async () => {
      const invalidRequest: TCertificateRequest = {
        ...validRequest,
        subjectAlternativeNames: [
          { type: CertSubjectAlternativeNameType.DNS_NAME, value: "forbidden.com" },
          { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" }
        ]
      };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "dns_name SAN value 'forbidden.com' does not match allowed patterns: *.example.com, *.api.example.com"
      );
    });

    it("should detect denied SAN values", async () => {
      const templateWithDenySan = {
        ...sampleTemplate,
        sans: [
          ...sampleTemplate.sans!,
          {
            type: CertSubjectAlternativeNameType.EMAIL,
            denied: ["forbidden@example.com"]
          }
        ]
      };

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithDenySan);

      const invalidRequest: TCertificateRequest = {
        ...validRequest,
        subjectAlternativeNames: [
          { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
          { type: CertSubjectAlternativeNameType.EMAIL, value: "forbidden@example.com" }
        ]
      };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("email SAN matching denied pattern 'forbidden@example.com' found in request");
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

    it("should detect TTL exceeding maximum duration", async () => {
      const templateWithMaxDuration = {
        ...sampleTemplate,
        validity: {
          max: "90d"
        }
      };

      mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithMaxDuration);

      const invalidRequest = { ...validRequest, validity: { ttl: "100d" } };

      const result = await service.validateCertificateRequest("template-123", invalidRequest);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Requested validity period exceeds maximum allowed duration");
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

      await Promise.all(
        testCases.map(async (testCase) => {
          const request = { ...validRequest, validity: { ttl: testCase.ttl } };

          if (testCase.shouldThrow) {
            await expect(service.validateCertificateRequest("template-123", request)).rejects.toThrow(
              `Invalid TTL format: ${testCase.ttl}`
            );
          } else {
            const result = await service.validateCertificateRequest("template-123", request);
            expect(result.isValid).toBe(testCase.shouldBeValid);
          }
        })
      );
    });

    it("should allow optional key usages and extended key usages", async () => {
      const requestWithOptionalUsages = {
        ...validRequest,
        keyUsages: [
          CertKeyUsageType.DIGITAL_SIGNATURE,
          CertKeyUsageType.KEY_ENCIPHERMENT,
          CertKeyUsageType.DATA_ENCIPHERMENT
        ],
        extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH, CertExtendedKeyUsageType.CLIENT_AUTH]
      };

      const result = await service.validateCertificateRequest("template-123", requestWithOptionalUsages);

      expect(result.isValid).toBe(true);
    });

    it("should validate wildcard patterns in allow attributes", async () => {
      const wildcardTemplate = {
        ...sampleTemplate,
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            rule: CertAttributeRule.ALLOW,
            value: "*.example.com"
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(wildcardTemplate);

      const requestWithWildcard = {
        commonName: "api.example.com",
        keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
        subjectAlternativeNames: [
          { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
          { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" }
        ],
        validity: { ttl: "30d" }
      };

      const result = await service.validateCertificateRequest("template-123", requestWithWildcard);
      expect(result.isValid).toBe(true);
    });

    it("should reject wildcard patterns that don't match", async () => {
      const wildcardTemplate = {
        ...sampleTemplate,
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            rule: CertAttributeRule.ALLOW,
            value: "*.example.com"
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(wildcardTemplate);

      const requestWithNonMatchingWildcard = {
        commonName: "api.notexample.com",
        keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
        subjectAlternativeNames: [
          { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
          { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" }
        ],
        validity: { ttl: "30d" }
      };

      const result = await service.validateCertificateRequest("template-123", requestWithNonMatchingWildcard);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "common_name value 'api.notexample.com' does not match allowed patterns: *.example.com, example.com"
      );
    });

    it("should require attribute value when allow rule exists", async () => {
      const emptyAllowTemplate = {
        ...sampleTemplate,
        attributes: [
          {
            type: CertSubjectAttributeType.COMMON_NAME,
            rule: CertAttributeRule.ALLOW,
            value: "example.com"
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(emptyAllowTemplate);

      const requestWithoutCommonName = {
        keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
        extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
        subjectAlternativeNames: [
          { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
          { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" }
        ],
        validity: { ttl: "30d" }
      };

      const result = await service.validateCertificateRequest("template-123", requestWithoutCommonName);
      expect(result.isValid).toBe(true);
    });

    it("should prevent certificates from including denied SANs", async () => {
      const denyTemplate = {
        ...sampleTemplate,
        sans: [
          ...sampleTemplate.sans!,
          {
            type: CertSubjectAlternativeNameType.EMAIL,
            denied: ["*@example.com"]
          }
        ]
      };
      mockCertificateTemplateV2DAL.findById.mockResolvedValue(denyTemplate);

      const requestWithProhibitedSan = {
        ...validRequest,
        subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.EMAIL as const, value: "test@example.com" }]
      };

      const result = await service.validateCertificateRequest("template-123", requestWithProhibitedSan);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("email SAN matching denied pattern 'test@example.com' found in request");
    });

    describe("comprehensive template validation scenarios", () => {
      it("should handle template with minimal required fields only", async () => {
        const minimalTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["*"]
            }
          ],
          keyUsages: {
            required: [CertKeyUsageType.DIGITAL_SIGNATURE]
          },
          extendedKeyUsages: {
            allowed: [CertExtendedKeyUsageType.SERVER_AUTH]
          },
          sans: [],
          validity: {
            max: "30d"
          },
          algorithms: undefined
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(minimalTemplate);

        const minimalReq = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
          validity: { ttl: "15d" }
        };

        const result = await service.validateCertificateRequest("template-123", minimalReq);
        expect(result.isValid).toBe(true);
      });

      it("should handle template with all fields set to allow", async () => {
        const allowTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["*"]
            },
            {
              type: CertSubjectAttributeType.ORGANIZATION,
              allowed: ["*"]
            }
          ],
          keyUsages: {
            allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT]
          },
          extendedKeyUsages: {
            allowed: [CertExtendedKeyUsageType.SERVER_AUTH, CertExtendedKeyUsageType.CLIENT_AUTH]
          },
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(allowTemplate);

        const emptyRequest = {
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", emptyRequest);
        expect(result.isValid).toBe(true);
      });

      it("should handle template with SAN fields denied", async () => {
        const denyTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["example.com"]
            }
          ],
          keyUsages: {
            required: [CertKeyUsageType.DIGITAL_SIGNATURE]
          },
          extendedKeyUsages: {
            required: [CertExtendedKeyUsageType.SERVER_AUTH]
          },
          sans: [
            {
              type: CertSubjectAlternativeNameType.EMAIL,
              denied: ["*"]
            },
            {
              type: CertSubjectAlternativeNameType.URI,
              denied: ["*"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(denyTemplate);

        const requestWithProhibited = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.EMAIL as const, value: "test@example.com" },
            { type: CertSubjectAlternativeNameType.URI as const, value: "https://example.com" }
          ],
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", requestWithProhibited);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("email SAN matching denied pattern 'test@example.com' found in request");
        expect(result.errors).toContain("uri SAN matching denied pattern 'https://example.com' found in request");
      });

      it("should validate complex attribute value constraints", async () => {
        const constrainedTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["example.com", "test.com"]
            }
          ],
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*.example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(constrainedTemplate);

        const validConstrainedRequest = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const validResult = await service.validateCertificateRequest("template-123", validConstrainedRequest);
        expect(validResult.isValid).toBe(true);

        const invalidConstrainedRequest = {
          commonName: "forbidden.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const invalidResult = await service.validateCertificateRequest("template-123", invalidConstrainedRequest);
        expect(invalidResult.isValid).toBe(false);
        expect(invalidResult.errors).toContain("common_name value 'forbidden.com' is not in allowed values list");
      });

      it("should validate SAN value constraints with multiple types", async () => {
        const sanTemplate = {
          ...sampleTemplate,
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              required: ["*.example.com"]
            },
            {
              type: CertSubjectAlternativeNameType.IP_ADDRESS,
              allowed: ["192.168.1.*"]
            },
            {
              type: CertSubjectAlternativeNameType.EMAIL,
              required: ["*@example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(sanTemplate);

        const validSanRequest = {
          commonName: "api.example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME as const, value: "api.example.com" },
            { type: CertSubjectAlternativeNameType.IP_ADDRESS as const, value: "192.168.1.100" },
            { type: CertSubjectAlternativeNameType.EMAIL as const, value: "admin@example.com" }
          ],
          validity: { ttl: "30d" }
        };

        const validResult = await service.validateCertificateRequest("template-123", validSanRequest);
        expect(validResult.isValid).toBe(true);

        const missingSanRequest = {
          commonName: "api.example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME as const, value: "api.example.com" }
          ],
          validity: { ttl: "30d" }
        };

        const missingResult = await service.validateCertificateRequest("template-123", missingSanRequest);
        expect(missingResult.isValid).toBe(false);
        expect(missingResult.errors).toContain(
          "Required email SAN matching pattern '*@example.com' not found in request"
        );
      });

      it("should validate key usage combinations thoroughly", async () => {
        const keyUsageTemplate = {
          ...sampleTemplate,
          keyUsages: {
            required: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
            allowed: [
              CertKeyUsageType.DIGITAL_SIGNATURE,
              CertKeyUsageType.KEY_ENCIPHERMENT,
              CertKeyUsageType.DATA_ENCIPHERMENT,
              CertKeyUsageType.KEY_AGREEMENT
            ]
          },
          extendedKeyUsages: {
            required: [CertExtendedKeyUsageType.SERVER_AUTH],
            allowed: [
              CertExtendedKeyUsageType.SERVER_AUTH,
              CertExtendedKeyUsageType.CLIENT_AUTH,
              CertExtendedKeyUsageType.EMAIL_PROTECTION
            ]
          },
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*.example.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(keyUsageTemplate);

        const minimalUsageRequest = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const minimalResult = await service.validateCertificateRequest("template-123", minimalUsageRequest);
        expect(minimalResult.isValid).toBe(true);

        const extendedUsageRequest = {
          commonName: "example.com",
          keyUsages: [
            CertKeyUsageType.DIGITAL_SIGNATURE,
            CertKeyUsageType.KEY_ENCIPHERMENT,
            CertKeyUsageType.DATA_ENCIPHERMENT
          ],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH, CertExtendedKeyUsageType.CLIENT_AUTH],
          validity: { ttl: "30d" }
        };

        const extendedResult = await service.validateCertificateRequest("template-123", extendedUsageRequest);
        expect(extendedResult.isValid).toBe(true);

        const forbiddenUsageRequest = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT, CertKeyUsageType.CRL_SIGN],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const forbiddenResult = await service.validateCertificateRequest("template-123", forbiddenUsageRequest);
        expect(forbiddenResult.isValid).toBe(false);
        expect(forbiddenResult.errors).toContain("Invalid key usages: crl_sign");
      });

      it("should validate algorithm constraints thoroughly", async () => {
        const algorithmTemplate = {
          ...sampleTemplate,
          algorithms: {
            signature: ["RSA-SHA256", "RSA-SHA512"],
            keyAlgorithm: ["RSA-2048", "RSA-4096"]
          },
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(algorithmTemplate);

        const validAlgoRequest = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          signatureAlgorithm: "RSA-SHA512",
          keyAlgorithm: "RSA_4096",
          validity: { ttl: "30d" }
        };

        const validResult = await service.validateCertificateRequest("template-123", validAlgoRequest);
        expect(validResult.isValid).toBe(true);

        const invalidSigRequest = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          signatureAlgorithm: "ECDSA-SHA256",
          keyAlgorithm: "RSA_2048",
          validity: { ttl: "30d" }
        };

        const invalidSigResult = await service.validateCertificateRequest("template-123", invalidSigRequest);
        expect(invalidSigResult.isValid).toBe(false);
        expect(invalidSigResult.errors).toContain(
          "Signature algorithm 'ECDSA-SHA256' is not allowed by template policy"
        );

        const invalidKeyRequest = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          signatureAlgorithm: "RSA-SHA256",
          keyAlgorithm: "EC_prime256v1",
          validity: { ttl: "30d" }
        };

        const invalidKeyResult = await service.validateCertificateRequest("template-123", invalidKeyRequest);
        expect(invalidKeyResult.isValid).toBe(false);
        expect(invalidKeyResult.errors).toContain("Key algorithm 'EC_prime256v1' is not allowed by template policy");
      });

      it("should validate validity period edge cases", async () => {
        const validityTemplate = {
          ...sampleTemplate,
          validity: {
            max: "365d"
          },
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(validityTemplate);

        const testCases = [
          { ttl: "1d", shouldBeValid: true, description: "minimum duration" },
          { ttl: "365d", shouldBeValid: true, description: "maximum duration" },
          { ttl: "366d", shouldBeValid: false, description: "exceeds maximum" },
          { ttl: "23h", shouldBeValid: true, description: "valid duration under max" },
          { ttl: "24h", shouldBeValid: true, description: "exactly 1 day in hours" },
          { ttl: "8760h", shouldBeValid: true, description: "exactly 365 days in hours" },
          { ttl: "12m", shouldBeValid: true, description: "exactly 365 days in months" },
          { ttl: "1y", shouldBeValid: true, description: "exactly 365 days in years" }
        ];

        await Promise.all(
          testCases.map(async (testCase) => {
            const request = {
              commonName: "example.com",
              keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
              extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
              validity: { ttl: testCase.ttl }
            };

            const result = await service.validateCertificateRequest("template-123", request);
            expect(result.isValid).toBe(testCase.shouldBeValid);

            if (!testCase.shouldBeValid) {
              expect(result.errors.length).toBeGreaterThan(0);
            }
          })
        );
      });
    });

    describe("unlisted field validation", () => {
      it("should reject requests with unlisted subject attributes", async () => {
        const templateWithLimitedAttributes = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["*"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithLimitedAttributes);

        const requestWithUnlistedKeyUsage = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.ENCIPHER_ONLY], // ENCIPHER_ONLY not allowed
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", requestWithUnlistedKeyUsage);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Invalid key usages: encipher_only");
      });

      it("should reject requests with unlisted SAN types", async () => {
        const templateWithLimitedSans = {
          ...sampleTemplate,
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithLimitedSans);

        const requestWithUnlistedSan = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.EMAIL as const, value: "test@example.com" } // This should be rejected
          ],
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", requestWithUnlistedSan);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("email SAN is not allowed by template policy (not defined in template)");
      });

      it("should reject requests with unlisted key usages when template doesn't define any", async () => {
        const templateWithoutKeyUsages = {
          ...sampleTemplate,
          keyUsages: undefined
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithoutKeyUsages);

        const requestWithKeyUsages = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE], // This should be rejected
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", requestWithKeyUsages);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain("Key usages are not allowed by template policy (not defined in template)");
      });

      it("should reject requests with algorithms when template doesn't define any", async () => {
        const templateWithoutAlgorithms = {
          ...sampleTemplate,
          algorithms: undefined
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithoutAlgorithms);

        const requestWithAlgorithms = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          signatureAlgorithm: "RSA-SHA256", // This should be rejected
          keyAlgorithm: "RSA-2048", // This should be rejected
          validity: { ttl: "30d" }
        };

        const result = await service.validateCertificateRequest("template-123", requestWithAlgorithms);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Signature algorithm 'RSA-SHA256' is not allowed by template policy (not defined in template)"
        );
        expect(result.errors).toContain(
          "Key algorithm 'RSA-2048' is not allowed by template policy (not defined in template)"
        );
      });
    });

    describe("comprehensive subject attribute validation", () => {
      it("should validate all subject attribute types", async () => {
        const comprehensiveTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              required: ["*"]
            }
          ],
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(comprehensiveTemplate);

        const validComprehensiveRequest = {
          commonName: "example.com",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const validResult = await service.validateCertificateRequest("template-123", validComprehensiveRequest);
        expect(validResult.isValid).toBe(true);

        // Test missing mandatory field
        const missingCommonNameRequest = {
          ...validComprehensiveRequest,
          commonName: undefined
        };

        const missingCommonNameResult = await service.validateCertificateRequest(
          "template-123",
          missingCommonNameRequest
        );
        expect(missingCommonNameResult.isValid).toBe(false);
        expect(missingCommonNameResult.errors).toContain("Missing required common_name attribute");
      });
    });

    describe("improved wildcard pattern validation", () => {
      it("should handle complex wildcard patterns", async () => {
        const wildcardTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["v1.api.example.com", "service-auth.internal.com", "exact-match.com"]
            }
          ],
          sans: []
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(wildcardTemplate);

        const testCases = [
          // Valid patterns
          { commonName: "v1.api.example.com", shouldBeValid: true },
          { commonName: "service-auth.internal.com", shouldBeValid: true },
          { commonName: "exact-match.com", shouldBeValid: true },
          // Invalid patterns
          { commonName: "api.example.com", shouldBeValid: false }, // Missing subdomain for *.api.example.com
          { commonName: "service.internal.com", shouldBeValid: false }, // Missing dash and wildcard part
          { commonName: "not-exact-match.com", shouldBeValid: false }
        ];

        for (const testCase of testCases) {
          const request = {
            commonName: testCase.commonName,
            keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
            extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
            validity: { ttl: "30d" }
          };

          const result = await service.validateCertificateRequest("template-123", request);
          expect(result.isValid).toBe(testCase.shouldBeValid);

          if (!testCase.shouldBeValid) {
            expect(
              result.errors.some(
                (error) => error.includes("does not match allowed patterns") || error.includes("not in allowed values")
              )
            ).toBe(true);
          }
        }
      });

      it("should handle special regex characters in wildcard patterns", async () => {
        const specialCharTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["*.test-site.com", "service[1-9].example.com", "api.{prod,staging}.com"]
            }
          ],
          sans: []
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(specialCharTemplate);

        const testCases = [
          { commonName: "app.test-site.com", shouldBeValid: true },
          { commonName: "service[1-9].example.com", shouldBeValid: true }, // Should match exactly, not as regex
          { commonName: "service1.example.com", shouldBeValid: false }, // Should not match as regex pattern
          { commonName: "api.{prod,staging}.com", shouldBeValid: true }, // Should match exactly
          { commonName: "api.prod.com", shouldBeValid: false } // Should not match as regex pattern
        ];

        for (const testCase of testCases) {
          const request = {
            commonName: testCase.commonName,
            keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
            extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
            validity: { ttl: "30d" }
          };

          const result = await service.validateCertificateRequest("template-123", request);
          expect(result.isValid).toBe(testCase.shouldBeValid);
        }
      });
    });

    describe("algorithm validation", () => {
      it("should validate signature algorithm constraints", async () => {
        const algorithmTemplate = {
          ...sampleTemplate,
          algorithms: {
            signature: ["RSA-SHA256", "RSA-SHA512", "ECDSA-SHA256"],
            keyAlgorithm: ["RSA_2048", "RSA_4096", "EC_prime256v1"]
          },
          sans: [
            {
              type: CertSubjectAlternativeNameType.IP_ADDRESS,
              allowed: ["*"]
            }
          ]
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
            keyAlgorithm: "EC_prime256v1",
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
            keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
            extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
            subjectAlternativeNames: [
              { type: CertSubjectAlternativeNameType.IP_ADDRESS as const, value: "192.168.1.1" }
            ],
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

      it("should validate when no algorithm constraints are defined but no algorithms in request", async () => {
        const templateWithoutAlgorithms = {
          ...sampleTemplate,
          algorithms: undefined,
          sans: undefined
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithoutAlgorithms);

        const request = {
          commonName: "example.com",
          validity: { ttl: "30d" },
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH]
        };

        const result = await service.validateCertificateRequest("template-123", request);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should reject algorithms when template has no algorithm constraints", async () => {
        const templateWithoutAlgorithms = {
          ...sampleTemplate,
          algorithms: undefined
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(templateWithoutAlgorithms);

        const requestWithAlgorithms = {
          commonName: "example.com",
          validity: { ttl: "30d" },
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.IP_ADDRESS as const, value: "192.168.1.1" }],
          signatureAlgorithm: "RSA-SHA256",
          keyAlgorithm: "RSA_2048"
        };

        const result = await service.validateCertificateRequest("template-123", requestWithAlgorithms);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain(
          "Signature algorithm 'RSA-SHA256' is not allowed by template policy (not defined in template)"
        );
        expect(result.errors).toContain(
          "Key algorithm 'RSA_2048' is not allowed by template policy (not defined in template)"
        );
      });

      it("should allow requests that match any of multiple attribute policies of same type", async () => {
        const multipleAttributePoliciesTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["*.infisical.com", "*.infisical2.com"]
            }
          ],
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*.infisical.com", "*.infisical2.com"]
            }
          ]
        };
        mockCertificateTemplateV2DAL.findById.mockResolvedValue(multipleAttributePoliciesTemplate);

        // Test case that matches first policy
        const requestMatchingFirstPolicy = {
          commonName: "test.infisical.com",
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME as const, value: "api.infisical.com" }
          ],
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const result1 = await service.validateCertificateRequest("template-123", requestMatchingFirstPolicy);
        expect(result1.isValid).toBe(true);

        // Test case that matches second policy
        const requestMatchingSecondPolicy = {
          commonName: "test.infisical2.com",
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME as const, value: "api.infisical2.com" }
          ],
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const result2 = await service.validateCertificateRequest("template-123", requestMatchingSecondPolicy);
        expect(result2.isValid).toBe(true);

        // Test case that matches neither policy
        const requestMatchingNeitherPolicy = {
          commonName: "test.example.com",
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME as const, value: "api.example.com" }
          ],
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const result3 = await service.validateCertificateRequest("template-123", requestMatchingNeitherPolicy);
        expect(result3.isValid).toBe(false);
        expect(result3.errors).toContain(
          "common_name value 'test.example.com' does not match allowed patterns: *.infisical.com, *.infisical2.com"
        );
      });
    });

    describe("New validation logic with allow/deny/require", () => {
      it("should validate complex attribute value constraints", async () => {
        const complexTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["*.example.com"]
            },
            {
              type: CertSubjectAttributeType.ORGANIZATION,
              allowed: ["Example*"]
            },
            {
              type: CertSubjectAttributeType.COUNTRY,
              denied: ["XX"]
            }
          ],
          sans: []
        };

        mockCertificateTemplateV2DAL.findById.mockResolvedValue(complexTemplate);

        const validComplexRequest = {
          commonName: "api.example.com",
          organization: "Example Corp",
          country: "US",
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const result1 = await service.validateCertificateRequest("template-123", validComplexRequest);
        expect(result1.isValid).toBe(true);

        const invalidCountryRequest = { ...validComplexRequest, country: "XX" };
        const result2 = await service.validateCertificateRequest("template-123", invalidCountryRequest);
        expect(result2.isValid).toBe(false);
        expect(result2.errors).toContain("country value 'XX' is denied by template policy");
        const invalidOrgRequest = { ...validComplexRequest, organization: "Different Corp" };
        const result3 = await service.validateCertificateRequest("template-123", invalidOrgRequest);
        expect(result3.isValid).toBe(false);
        expect(result3.errors).toContain(
          "organization value 'Different Corp' does not match allowed patterns: Example*"
        );
      });

      it("should handle SAN allow/deny/require logic", async () => {
        const sanTemplate = {
          ...sampleTemplate,
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*.example.com"]
            },
            {
              type: CertSubjectAlternativeNameType.EMAIL,
              required: ["*@example.com"]
            },
            {
              type: CertSubjectAlternativeNameType.IP_ADDRESS,
              denied: ["192.168.1.*"]
            }
          ]
        };

        mockCertificateTemplateV2DAL.findById.mockResolvedValue(sanTemplate);

        const validSanRequest = {
          commonName: "api.example.com",
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
            { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" }
          ],
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const result1 = await service.validateCertificateRequest("template-123", validSanRequest);
        expect(result1.isValid).toBe(true);

        const missingEmailRequest = {
          ...validSanRequest,
          subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" }]
        };

        const result2 = await service.validateCertificateRequest("template-123", missingEmailRequest);
        expect(result2.isValid).toBe(false);
        expect(result2.errors).toContain("Required email SAN matching pattern '*@example.com' not found in request");

        const deniedIpRequest = {
          ...validSanRequest,
          subjectAlternativeNames: [
            ...validSanRequest.subjectAlternativeNames,
            { type: CertSubjectAlternativeNameType.IP_ADDRESS, value: "192.168.1.100" }
          ]
        };

        const result3 = await service.validateCertificateRequest("template-123", deniedIpRequest);
        expect(result3.isValid).toBe(false);
        expect(result3.errors).toContain("ip_address SAN matching denied pattern '192.168.1.100' found in request");
      });

      it("should validate wildcard patterns correctly", async () => {
        const wildcardTemplate = {
          ...sampleTemplate,
          subject: [
            {
              type: CertSubjectAttributeType.COMMON_NAME,
              allowed: ["*.acme.com"]
            }
          ],
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              allowed: ["*.api.acme.com"]
            }
          ]
        };

        mockCertificateTemplateV2DAL.findById.mockResolvedValue(wildcardTemplate);

        const testCases = [
          { cn: "api.acme.com", san: "v1.api.acme.com", shouldPass: true },
          { cn: "www.acme.com", san: "beta.api.acme.com", shouldPass: true },
          { cn: "acme.com", san: "api.acme.com", shouldPass: false }, // Missing subdomain
          { cn: "api.notacme.com", san: "v1.api.acme.com", shouldPass: false }, // Wrong domain
          { cn: "api.acme.com", san: "api.acme.com", shouldPass: false } // SAN missing required subdomain
        ];

        for (const testCase of testCases) {
          const request = {
            commonName: testCase.cn,
            subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: testCase.san }],
            keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
            extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
            validity: { ttl: "30d" }
          };

          const result = await service.validateCertificateRequest("template-123", request);
          expect(result.isValid).toBe(testCase.shouldPass);
        }
      });

      it("should enforce multiple required SAN types", async () => {
        const multiRequiredTemplate = {
          ...sampleTemplate,
          sans: [
            {
              type: CertSubjectAlternativeNameType.DNS_NAME,
              required: ["*.example.com"]
            },
            {
              type: CertSubjectAlternativeNameType.EMAIL,
              required: ["*@example.com"]
            },
            {
              type: CertSubjectAlternativeNameType.URI,
              required: ["https://*.example.com/*"]
            }
          ]
        };

        mockCertificateTemplateV2DAL.findById.mockResolvedValue(multiRequiredTemplate);

        const completeRequest = {
          commonName: "api.example.com",
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
            { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" },
            { type: CertSubjectAlternativeNameType.URI, value: "https://api.example.com/webhook" }
          ],
          keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
          extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
          validity: { ttl: "30d" }
        };

        const result1 = await service.validateCertificateRequest("template-123", completeRequest);
        expect(result1.isValid).toBe(true);

        const incompleteRequest = {
          ...completeRequest,
          subjectAlternativeNames: [
            { type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" },
            { type: CertSubjectAlternativeNameType.EMAIL, value: "admin@example.com" }
          ]
        };

        const result2 = await service.validateCertificateRequest("template-123", incompleteRequest);
        expect(result2.isValid).toBe(false);
        expect(result2.errors).toContain(
          "Required uri SAN matching pattern 'https://*.example.com/*' not found in request"
        );
      });
    });
  });
});
