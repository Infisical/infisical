import { ForbiddenError, subject } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import RE2 from "re2";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { CertPolicyState, CertSubjectAttributeType } from "../certificate-common/certificate-constants";
import { TCertificatePolicyDALFactory } from "./certificate-policy-dal";
import {
  TCertificatePolicy,
  TCertificatePolicyInsert,
  TCertificatePolicyUpdate,
  TCertificateRequest,
  TPolicyValidationResult
} from "./certificate-policy-types";

type TCertificatePolicyServiceFactoryDep = {
  certificatePolicyDAL: TCertificatePolicyDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export const certificatePolicyServiceFactory = ({
  certificatePolicyDAL,
  permissionService
}: TCertificatePolicyServiceFactoryDep) => {
  const consolidateAttributeArray = <
    T extends { type: string; allowed?: string[]; required?: string[]; denied?: string[] }
  >(
    attributes: T[]
  ): T[] => {
    const consolidated = new Map<string, T>();

    attributes.forEach((attr) => {
      const existing = consolidated.get(attr.type);
      if (existing) {
        throw new ForbiddenRequestError({
          message: `Duplicate attribute type '${attr.type}' found in request. Each attribute type must appear only once.`
        });
      } else {
        consolidated.set(attr.type, attr);
      }
    });

    return Array.from(consolidated.values());
  };

  const parseTTL = (ttl: string): number => {
    const regex = new RE2("^(\\d+)([dmyh])$");
    const match = regex.exec(ttl);
    if (!match) {
      throw new Error(`Invalid TTL format: ${ttl}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      case "m":
        return value * 30 * 24 * 60 * 60 * 1000;
      case "y":
        return value * 365 * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unsupported TTL unit: ${unit}`);
    }
  };

  const validateSubjectAttributePolicy = (
    subjectAttributes: Array<{ type: string; allowed?: string[]; required?: string[]; denied?: string[] }>
  ) => {
    if (!subjectAttributes || subjectAttributes.length === 0) return;

    // Validate each subject attribute policy
    for (const attr of subjectAttributes) {
      // Ensure at least one field is provided
      if (!attr.allowed && !attr.required && !attr.denied) {
        throw new ForbiddenRequestError({
          message: `Subject attribute type '${attr.type}' must have at least one allowed, required, or denied value`
        });
      }

      // Check for duplicate values within arrays
      const arrays = [
        { name: "allowed", values: attr.allowed },
        { name: "required", values: attr.required },
        { name: "denied", values: attr.denied }
      ];

      for (const { name, values } of arrays) {
        if (values && values.length > 0) {
          const uniqueValues = new Set(values);
          if (uniqueValues.size !== values.length) {
            throw new ForbiddenRequestError({
              message: `Duplicate values found in ${name} list for subject attribute type '${attr.type}'`
            });
          }
        }
      }
    }
  };

  const validateSanPolicy = (
    sans: Array<{ type: string; allowed?: string[]; required?: string[]; denied?: string[] }>
  ) => {
    if (!sans || sans.length === 0) return;

    // Validate each SAN policy
    for (const san of sans) {
      if (!san.allowed && !san.required && !san.denied) {
        throw new ForbiddenRequestError({
          message: `SAN type '${san.type}' must have at least one allowed, required, or denied value`
        });
      }

      const arrays = [
        { name: "allowed", values: san.allowed },
        { name: "required", values: san.required },
        { name: "denied", values: san.denied }
      ];

      for (const { name, values } of arrays) {
        if (values && values.length > 0) {
          const uniqueValues = new Set(values);
          if (uniqueValues.size !== values.length) {
            throw new ForbiddenRequestError({
              message: `Duplicate values found in ${name} list for SAN type '${san.type}'`
            });
          }
        }
      }
    }
  };

  const generateTemplateSlug = (baseName?: string): string => {
    if (baseName) {
      return slugify(baseName);
    }
    return slugify(alphaNumericNanoId(12));
  };

  const ensureUniqueSlug = async (projectId: string, desiredSlug: string, policyId?: string): Promise<string> => {
    const existingTemplate = await certificatePolicyDAL.findByNameAndProjectId(desiredSlug, projectId);
    if (!existingTemplate || (policyId && existingTemplate.id === policyId)) {
      return desiredSlug;
    }
    const alternativeSlug = `${desiredSlug}-${alphaNumericNanoId(8)}`;
    const existingAlternative = await certificatePolicyDAL.findByNameAndProjectId(alternativeSlug, projectId);
    if (!existingAlternative) {
      return alternativeSlug;
    }

    const randomSlug = slugify(alphaNumericNanoId(12));
    return randomSlug;
  };

  const isWildcardPattern = (value: string): boolean => {
    return value.includes("*");
  };

  const createWildcardRegex = (pattern: string): RegExp => {
    const wildcardRegex = new RE2(/\*/g);
    const withPlaceholder = pattern.replace(wildcardRegex, "__WILDCARD__");
    const escapeRegex = new RE2(/[.+?^${}()|[\]\\]/g);
    const escaped = withPlaceholder.replace(escapeRegex, "\\$&");
    const placeholderRegex = new RE2(/__WILDCARD__/g);
    const regexPattern = escaped.replace(placeholderRegex, ".*");
    return new RE2(`^${regexPattern}$`);
  };

  const mapTemplateSignatureAlgorithmToApi = (templateFormat: string): string => {
    const mapping: Record<string, string> = {
      "SHA256-RSA": "RSA-SHA256",
      "SHA384-RSA": "RSA-SHA384",
      "SHA512-RSA": "RSA-SHA512",
      "SHA256-ECDSA": "ECDSA-SHA256",
      "SHA384-ECDSA": "ECDSA-SHA384",
      "SHA512-ECDSA": "ECDSA-SHA512"
    };
    return mapping[templateFormat] || templateFormat;
  };

  const mapTemplateKeyAlgorithmToApi = (templateFormat: string): string => {
    const mapping: Record<string, string> = {
      "RSA-2048": "RSA_2048",
      "RSA-3072": "RSA_3072",
      "RSA-4096": "RSA_4096",
      "ECDSA-P256": "EC_prime256v1",
      "ECDSA-P384": "EC_secp384r1",
      "ECDSA-P521": "EC_secp521r1"
    };
    return mapping[templateFormat] || templateFormat;
  };

  const validateKeyUsagePolicy = (keyUsages: { allowed?: string[]; required?: string[]; denied?: string[] }) => {
    if (!keyUsages) return;

    if (!keyUsages.allowed && !keyUsages.required && !keyUsages.denied) {
      throw new ForbiddenRequestError({
        message: "Key usages must have at least one allowed, required, or denied value"
      });
    }

    const arrays = [
      { name: "allowed", values: keyUsages.allowed },
      { name: "required", values: keyUsages.required },
      { name: "denied", values: keyUsages.denied }
    ];

    for (const { name, values } of arrays) {
      if (values && values.length > 0) {
        const uniqueValues = new Set(values);
        if (uniqueValues.size !== values.length) {
          throw new ForbiddenRequestError({
            message: `Duplicate values found in ${name} key usages list`
          });
        }
      }
    }
  };

  const validateExtendedKeyUsagePolicy = (extendedKeyUsages: {
    allowed?: string[];
    required?: string[];
    denied?: string[];
  }) => {
    if (!extendedKeyUsages) return;

    if (!extendedKeyUsages.allowed && !extendedKeyUsages.required && !extendedKeyUsages.denied) {
      throw new ForbiddenRequestError({
        message: "Extended key usages must have at least one allowed, required, or denied value"
      });
    }

    const arrays = [
      { name: "allowed", values: extendedKeyUsages.allowed },
      { name: "required", values: extendedKeyUsages.required },
      { name: "denied", values: extendedKeyUsages.denied }
    ];

    for (const { name, values } of arrays) {
      if (values && values.length > 0) {
        const uniqueValues = new Set(values);
        if (uniqueValues.size !== values.length) {
          throw new ForbiddenRequestError({
            message: `Duplicate values found in ${name} extended key usages list`
          });
        }
      }
    }
  };

  const validateValueAgainstConstraints = (
    value: string,
    allowedValues: string[],
    fieldName: string
  ): { isValid: boolean; error?: string } => {
    if (!allowedValues || allowedValues.length === 0) {
      return { isValid: true };
    }

    const hasWildcards = allowedValues.some(isWildcardPattern);

    for (const allowedValue of allowedValues) {
      if (isWildcardPattern(allowedValue)) {
        try {
          const regex = createWildcardRegex(allowedValue);
          if (regex.test(value)) {
            return { isValid: true };
          }
        } catch (error) {
          if (allowedValue === value) {
            return { isValid: true };
          }
        }
      } else if (allowedValue === value) {
        return { isValid: true };
      }
    }

    if (hasWildcards) {
      return {
        isValid: false,
        error: `${fieldName} value '${value}' does not match allowed patterns: ${allowedValues.join(", ")}`
      };
    }
    return {
      isValid: false,
      error: `${fieldName} value '${value}' is not in allowed values list`
    };
  };

  const validateRequestAgainstPolicy = (
    template: TCertificatePolicy,
    request: TCertificateRequest
  ): TPolicyValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate subject attributes
    const subjectPolicies = template.subject;
    const requestAttributes = new Map<string, string>();
    if (request.commonName) requestAttributes.set(CertSubjectAttributeType.COMMON_NAME, request.commonName);
    if (request.organization) {
      requestAttributes.set(CertSubjectAttributeType.ORGANIZATION, request.organization);
    }
    if (request.country) requestAttributes.set(CertSubjectAttributeType.COUNTRY, request.country);

    if (subjectPolicies && subjectPolicies.length > 0) {
      for (const attrPolicy of subjectPolicies) {
        const requestValue = requestAttributes.get(attrPolicy.type);

        if (attrPolicy.required && attrPolicy.required.length > 0) {
          if (!requestValue) {
            errors.push(`Missing required ${attrPolicy.type} attribute`);
          } else {
            // Validate that the request value matches the required pattern
            const hasMatchingRequired = attrPolicy.required.some((requiredValue) => {
              const validation = validateValueAgainstConstraints(requestValue, [requiredValue], attrPolicy.type);
              return validation.isValid;
            });
            if (!hasMatchingRequired) {
              errors.push(
                `${attrPolicy.type} value '${requestValue}' does not match any required patterns: ${attrPolicy.required.join(", ")}`
              );
            }
          }
        }

        if (requestValue) {
          let isValueDenied = false;
          if (attrPolicy.denied && attrPolicy.denied.length > 0) {
            const validation = validateValueAgainstConstraints(requestValue, attrPolicy.denied, attrPolicy.type);
            if (validation.isValid) {
              errors.push(`${attrPolicy.type} value '${requestValue}' is denied by template policy`);
              isValueDenied = true;
            }
          }

          if (!isValueDenied && attrPolicy.allowed && attrPolicy.allowed.length > 0) {
            let satisfiesRequired = false;
            if (attrPolicy.required && attrPolicy.required.length > 0) {
              satisfiesRequired = attrPolicy.required.some((requiredValue) => {
                const validation = validateValueAgainstConstraints(requestValue, [requiredValue], attrPolicy.type);
                return validation.isValid;
              });
            }

            if (!satisfiesRequired) {
              const allowedValidation = validateValueAgainstConstraints(
                requestValue,
                attrPolicy.allowed,
                attrPolicy.type
              );
              if (!allowedValidation.isValid && allowedValidation.error) {
                errors.push(allowedValidation.error);
              }
            }
          }
        }
      }

      // Check if any request attributes are not covered by template policies
      for (const [attrType] of requestAttributes) {
        const hasPolicy = subjectPolicies.some((policy) => policy.type === attrType);
        if (!hasPolicy) {
          errors.push(`${attrType} is not allowed by template policy (not defined in template)`);
        }
      }
    } else if (requestAttributes.size > 0) {
      // No subject policies defined but request has subject attributes - deny all
      for (const [attrType] of requestAttributes) {
        errors.push(`${attrType} is not allowed by template policy (no subject policies defined)`);
      }
    }

    // Validate Subject Alternative Names
    const sansPolicies = template.sans;
    if (sansPolicies && sansPolicies.length > 0) {
      const requestSansByType = new Map<string, string[]>();

      // Group request SANs by type
      if (request.subjectAlternativeNames) {
        for (const san of request.subjectAlternativeNames) {
          if (!requestSansByType.has(san.type)) {
            requestSansByType.set(san.type, []);
          }
          requestSansByType.get(san.type)!.push(san.value);
        }
      }

      // Validate each SAN policy
      for (const sanPolicy of sansPolicies) {
        const requestSans = requestSansByType.get(sanPolicy.type) || [];

        // Check REQUIRED values - at least one SAN must match each required pattern
        if (sanPolicy.required && sanPolicy.required.length > 0) {
          for (const requiredValue of sanPolicy.required) {
            const hasMatchingRequiredSan = requestSans.some((sanValue) => {
              const validation = validateValueAgainstConstraints(sanValue, [requiredValue], `${sanPolicy.type} SAN`);
              return validation.isValid;
            });

            if (!hasMatchingRequiredSan) {
              errors.push(`Required ${sanPolicy.type} SAN matching pattern '${requiredValue}' not found in request`);
            }
          }
        }

        // Check DENIED values - no SAN should match denied patterns
        if (sanPolicy.denied && sanPolicy.denied.length > 0) {
          for (const sanValue of requestSans) {
            const validation = validateValueAgainstConstraints(sanValue, sanPolicy.denied, `${sanPolicy.type} SAN`);
            if (validation.isValid) {
              errors.push(`${sanPolicy.type} SAN matching denied pattern '${sanValue}' found in request`);
            }
          }
        }

        // Check ALLOWED values - if present, all SANs must match at least one allowed pattern
        if (sanPolicy.allowed && sanPolicy.allowed.length > 0 && requestSans.length > 0) {
          for (const sanValue of requestSans) {
            let satisfiesRequired = false;
            if (sanPolicy.required && sanPolicy.required.length > 0) {
              satisfiesRequired = sanPolicy.required.some((requiredValue) => {
                const validation = validateValueAgainstConstraints(sanValue, [requiredValue], `${sanPolicy.type} SAN`);
                return validation.isValid;
              });
            }

            if (!satisfiesRequired) {
              const validation = validateValueAgainstConstraints(sanValue, sanPolicy.allowed, `${sanPolicy.type} SAN`);
              if (!validation.isValid && validation.error) {
                errors.push(validation.error);
              }
            }
          }
        }
      }

      // Check if any request SANs are for types not covered by template policies
      for (const [requestSanType] of requestSansByType) {
        const hasPolicy = sansPolicies.some((policy) => policy.type === requestSanType);
        if (!hasPolicy) {
          errors.push(`${requestSanType} SAN is not allowed by template policy (not defined in template)`);
        }
      }
    } else if (request.subjectAlternativeNames && request.subjectAlternativeNames.length > 0) {
      // No SAN policies defined but request has SANs - deny all
      for (const san of request.subjectAlternativeNames) {
        errors.push(`${san.type} SAN is not allowed by template policy (no SAN policies defined)`);
      }
    }

    // Validate key usages
    const keyUsagePolicy = template.keyUsages;
    if (keyUsagePolicy) {
      // Check REQUIRED key usages - must have all required usages
      if (keyUsagePolicy.required && keyUsagePolicy.required.length > 0) {
        const missingRequired = keyUsagePolicy.required.filter((usage) => !request.keyUsages?.includes(usage));
        if (missingRequired.length > 0) {
          errors.push(`Missing required key usages: ${missingRequired.join(", ")}`);
        }
      }

      // Check DENIED key usages - must not have any denied usages
      if (request.keyUsages && keyUsagePolicy.denied && keyUsagePolicy.denied.length > 0) {
        const deniedUsages = request.keyUsages.filter((usage) => keyUsagePolicy?.denied?.includes(usage));
        if (deniedUsages.length > 0) {
          errors.push(`Denied key usages found in request: ${deniedUsages.join(", ")}`);
        }
      }

      // Check ALLOWED key usages - if present, all usages must be in allowed list
      if (request.keyUsages && keyUsagePolicy) {
        const allAllowedUsages = [...(keyUsagePolicy.required || []), ...(keyUsagePolicy.allowed || [])];
        const invalidUsages = request.keyUsages.filter((usage) => !allAllowedUsages.includes(usage));
        if (invalidUsages.length > 0) {
          errors.push(`Invalid key usages: ${invalidUsages.join(", ")}`);
        }
      }
    } else if (request.keyUsages && request.keyUsages.length > 0) {
      errors.push(`Key usages are not allowed by template policy (not defined in template)`);
    }

    // Validate extended key usages
    const extendedKeyUsagePolicy = template.extendedKeyUsages;
    if (extendedKeyUsagePolicy) {
      // Check REQUIRED extended key usages - must have all required usages
      if (extendedKeyUsagePolicy.required && extendedKeyUsagePolicy.required.length > 0) {
        const missingRequired = extendedKeyUsagePolicy.required.filter(
          (usage) => !request.extendedKeyUsages?.includes(usage)
        );
        if (missingRequired.length > 0) {
          errors.push(`Missing required extended key usages: ${missingRequired.join(", ")}`);
        }
      }

      // Check DENIED extended key usages - must not have any denied usages
      if (request.extendedKeyUsages && extendedKeyUsagePolicy.denied && extendedKeyUsagePolicy.denied.length > 0) {
        const deniedUsages = request.extendedKeyUsages.filter((usage) =>
          extendedKeyUsagePolicy?.denied?.includes(usage)
        );
        if (deniedUsages.length > 0) {
          errors.push(`Denied extended key usages found in request: ${deniedUsages.join(", ")}`);
        }
      }

      // Check ALLOWED extended key usages - if present, all usages must be in allowed list
      if (request.extendedKeyUsages && extendedKeyUsagePolicy) {
        const allAllowedExtendedUsages = [
          ...(extendedKeyUsagePolicy.required || []),
          ...(extendedKeyUsagePolicy.allowed || [])
        ];
        const invalidExtendedUsages = request.extendedKeyUsages.filter(
          (usage) => !allAllowedExtendedUsages.includes(usage)
        );
        if (invalidExtendedUsages.length > 0) {
          errors.push(`Invalid extended key usages: ${invalidExtendedUsages.join(", ")}`);
        }
      }
    } else if (request.extendedKeyUsages && request.extendedKeyUsages.length > 0) {
      errors.push(`Extended key usages are not allowed by template policy (not defined in template)`);
    }

    // Validate algorithms with new structure
    if (request.signatureAlgorithm) {
      if (template.algorithms?.signature && template.algorithms.signature.length > 0) {
        const mappedTemplateAlgorithms = template.algorithms.signature.map(mapTemplateSignatureAlgorithmToApi);
        if (!mappedTemplateAlgorithms.includes(request.signatureAlgorithm)) {
          errors.push(`Signature algorithm '${request.signatureAlgorithm}' is not allowed by template policy`);
        }
      } else if (!template.algorithms?.signature) {
        errors.push(
          `Signature algorithm '${request.signatureAlgorithm}' is not allowed by template policy (not defined in template)`
        );
      }
    }

    if (request.keyAlgorithm) {
      if (template.algorithms?.keyAlgorithm && template.algorithms.keyAlgorithm.length > 0) {
        const mappedTemplateKeyTypes = template.algorithms.keyAlgorithm.map(mapTemplateKeyAlgorithmToApi);
        if (!mappedTemplateKeyTypes.includes(request.keyAlgorithm)) {
          errors.push(`Key algorithm '${request.keyAlgorithm}' is not allowed by template policy`);
        }
      } else if (!template.algorithms?.keyAlgorithm) {
        errors.push(
          `Key algorithm '${request.keyAlgorithm}' is not allowed by template policy (not defined in template)`
        );
      }
    }

    // Validate validity with new structure
    if (request.validity?.ttl && (request.notBefore || request.notAfter)) {
      errors.push(
        "Cannot specify both TTL and notBefore/notAfter. Use either TTL for duration-based validity or notBefore/notAfter for explicit date range."
      );
    }

    if (request.notBefore && request.notAfter && request.notBefore >= request.notAfter) {
      errors.push("notBefore must be earlier than notAfter");
    }

    // Validate TTL against template validity constraints
    if (request.validity?.ttl && template.validity) {
      const requestDurationMs = parseTTL(request.validity.ttl);

      // Check maximum duration using max field
      if (template.validity.max) {
        const maxDurationMs = parseTTL(template.validity.max);

        if (requestDurationMs > maxDurationMs) {
          errors.push("Requested validity period exceeds maximum allowed duration");
        }
      }
    }
    // Validate explicit date range against max duration
    if ((request.notBefore || request.notAfter) && template.validity?.max) {
      const notBefore = request.notBefore || new Date();
      const { notAfter } = request;

      if (notAfter && notBefore && notAfter instanceof Date && notBefore instanceof Date) {
        const requestDuration = notAfter.getTime() - notBefore.getTime();
        const maxDurationMs = parseTTL(template.validity.max);

        if (requestDuration > maxDurationMs) {
          errors.push(
            `Requested validity period (notBefore to notAfter) exceeds maximum allowed duration of ${template.validity.max}`
          );
        }
      }
    }

    const isCaPolicy: CertPolicyState = (template.basicConstraints?.isCA as CertPolicyState) || CertPolicyState.DENIED;
    const requestWantsCA = request.basicConstraints?.isCA === true;

    if (isCaPolicy === CertPolicyState.DENIED) {
      if (requestWantsCA) {
        errors.push(
          "CA certificate issuance is denied by this policy. The policy does not allow issuing CA certificates."
        );
      }
    } else if (isCaPolicy === CertPolicyState.REQUIRED) {
      if (!requestWantsCA) {
        errors.push(
          "CA certificate issuance is required by this policy. The request must include basicConstraints with isCA set to true."
        );
      }
    }
    if (requestWantsCA && isCaPolicy !== CertPolicyState.DENIED) {
      const { maxPathLength } = template.basicConstraints || {};

      if (maxPathLength !== undefined && maxPathLength !== null && maxPathLength !== -1) {
        if (request.basicConstraints?.pathLength === undefined || request.basicConstraints?.pathLength === null) {
          errors.push(
            `Path length is required when issuing CA certificates because the policy only allows a maximum path length of ${maxPathLength}.`
          );
        } else if (request.basicConstraints.pathLength > maxPathLength) {
          errors.push(
            `Requested path length (${request.basicConstraints.pathLength}) exceeds maximum allowed by policy (${maxPathLength}).`
          );
        } else if (request.basicConstraints.pathLength < 0 && request.basicConstraints.pathLength !== -1) {
          errors.push("Path length must be -1 (unlimited), 0, or a positive integer.");
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  const createPolicy = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    data
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    data: Omit<TCertificatePolicyInsert, "projectId">;
  }): Promise<TCertificatePolicy> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificatePolicyActions.Create,
      subject(ProjectPermissionSub.CertificatePolicies, {
        name: data.name
      })
    );

    if (!data) {
      throw new Error("Template data is required");
    }

    const consolidatedData = {
      ...data,
      subject: data.subject ? consolidateAttributeArray(data.subject) : undefined,
      sans: data.sans ? consolidateAttributeArray(data.sans) : undefined
    };

    if (consolidatedData.subject) {
      validateSubjectAttributePolicy(consolidatedData.subject);
    }

    if (consolidatedData.sans) {
      validateSanPolicy(consolidatedData.sans);
    }

    if (consolidatedData.keyUsages) {
      validateKeyUsagePolicy(consolidatedData.keyUsages);
    }

    if (consolidatedData.extendedKeyUsages) {
      validateExtendedKeyUsagePolicy(consolidatedData.extendedKeyUsages);
    }

    // Generate slug from name and ensure it's unique within project
    if (!data.name) {
      throw new ForbiddenRequestError({ message: "Template name is required" });
    }

    const slug = generateTemplateSlug(data.name);
    const uniqueSlug = await ensureUniqueSlug(projectId, slug);

    const template = await certificatePolicyDAL.create({
      ...consolidatedData,
      name: uniqueSlug,
      projectId
    });

    return template;
  };

  const updatePolicy = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    policyId,
    data
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    policyId: string;
    data: TCertificatePolicyUpdate;
  }): Promise<TCertificatePolicy> => {
    const existingTemplate = await certificatePolicyDAL.findById(policyId);
    if (!existingTemplate) {
      throw new NotFoundError({ message: "Certificate policy not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: existingTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificatePolicyActions.Edit,
      subject(ProjectPermissionSub.CertificatePolicies, {
        name: existingTemplate.name
      })
    );

    const consolidatedData = {
      ...data,
      subject: data.subject ? consolidateAttributeArray(data.subject) : undefined,
      sans: data.sans ? consolidateAttributeArray(data.sans) : undefined
    };

    if (consolidatedData.subject) {
      validateSubjectAttributePolicy(consolidatedData.subject);
    }

    if (consolidatedData.sans) {
      validateSanPolicy(consolidatedData.sans);
    }

    if (consolidatedData.keyUsages) {
      validateKeyUsagePolicy(consolidatedData.keyUsages);
    }

    if (consolidatedData.extendedKeyUsages) {
      validateExtendedKeyUsagePolicy(consolidatedData.extendedKeyUsages);
    }

    const updateData = { ...consolidatedData };
    if (data.name && typeof data.name === "string") {
      const newSlug = generateTemplateSlug(data.name);
      if (newSlug !== existingTemplate.name) {
        const uniqueSlug = await ensureUniqueSlug(existingTemplate.projectId, newSlug, policyId);
        updateData.name = uniqueSlug;
      }
    }

    const updatedTemplate = await certificatePolicyDAL.updateById(policyId, updateData);
    if (!updatedTemplate) {
      throw new NotFoundError({ message: "Failed to update certificate policy" });
    }
    return updatedTemplate;
  };

  const getPolicyById = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    policyId,
    internal = false
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    policyId: string;
    internal?: boolean;
  }): Promise<TCertificatePolicy> => {
    const template = await certificatePolicyDAL.findById(policyId);
    if (!template) {
      throw new NotFoundError({ message: "Certificate policy not found" });
    }

    if (!internal) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId: template.projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCertificatePolicyActions.Read,
        subject(ProjectPermissionSub.CertificatePolicies, {
          name: template.name
        })
      );
    }

    return template;
  };

  const getPolicyBySlug = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    slug
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    slug: string;
  }): Promise<TCertificatePolicy> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const template = await certificatePolicyDAL.findByNameAndProjectId(slug, projectId);
    if (!template) {
      throw new NotFoundError({ message: "Certificate policy not found" });
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificatePolicyActions.Read,
      subject(ProjectPermissionSub.CertificatePolicies, {
        name: template.name
      })
    );
    return template;
  };

  const listPolicies = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    offset = 0,
    limit = 20,
    search
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    policies: TCertificatePolicy[];
    totalCount: number;
  }> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificatePolicyActions.Read,
      ProjectPermissionSub.CertificatePolicies
    );

    const processedRules = getProcessedPermissionRules(
      permission,
      ProjectPermissionCertificatePolicyActions.Read,
      ProjectPermissionSub.CertificatePolicies
    );
    const policies = await certificatePolicyDAL.findByProjectId(projectId, { offset, limit, search }, processedRules);

    const totalCount = await certificatePolicyDAL.countByProjectId(projectId, { search }, processedRules);

    return {
      policies,
      totalCount
    };
  };

  const deletePolicy = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    policyId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    policyId: string;
  }): Promise<TCertificatePolicy> => {
    const template = await certificatePolicyDAL.findById(policyId);
    if (!template) {
      throw new NotFoundError({ message: "Certificate policy not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: template.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificatePolicyActions.Delete,
      subject(ProjectPermissionSub.CertificatePolicies, {
        name: template.name
      })
    );

    const isInUse = await certificatePolicyDAL.isPolicyInUse(policyId);
    if (isInUse) {
      const profilesUsingTemplate = await certificatePolicyDAL.getProfilesUsingPolicy(policyId);
      const profileNames = profilesUsingTemplate
        .map((profile: { slug?: string; id: string }) => profile.slug || profile.id)
        .join(", ");

      throw new ForbiddenRequestError({
        message:
          profilesUsingTemplate.length > 0
            ? `Cannot delete policy '${template.name}' as it is currently in use by the following certificate profiles: ${profileNames}. Please remove this policy from these profiles before deleting it.`
            : `Cannot delete policy '${template.name}' as it is currently in use by one or more certificates. Please ensure no certificates are using this policy before deleting it.`
      });
    }

    const deletedTemplate = await certificatePolicyDAL.deleteById(policyId);
    if (!deletedTemplate) {
      throw new NotFoundError({ message: "Failed to delete certificate policy" });
    }

    return deletedTemplate as TCertificatePolicy;
  };

  const validateCertificateRequest = async (
    policyId: string,
    request: TCertificateRequest
  ): Promise<TPolicyValidationResult> => {
    const policy = await certificatePolicyDAL.findById(policyId);
    if (!policy) {
      throw new NotFoundError({ message: "Certificate policy not found" });
    }

    return validateRequestAgainstPolicy(policy, request);
  };

  return {
    createPolicy,
    updatePolicy,
    getPolicyById,
    getPolicyBySlug,
    listPolicies,
    deletePolicy,
    validateCertificateRequest
  };
};

export type TCertificatePolicyServiceFactory = ReturnType<typeof certificatePolicyServiceFactory>;
