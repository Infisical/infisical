import slugify from "@sindresorhus/slugify";

import { ProjectType } from "@app/db/schemas";
import {
  ApplicationPermissionActions,
  ApplicationPermissionSub,
  TApplicationPermissionService
} from "@app/domains/certificates/cert-manager/ce/module";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { findTemplatePolicyProblem } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-template-fns";
import { ActorType } from "@app/lib/auth/actor-types";
import { getProcessedPermissionRules } from "@app/lib/casl/permission-filter-utils";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import {
  CertPolicyState,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  MAX_CUSTOM_EXTENSION_RULES_PER_POLICY,
  MICROSOFT_AUTOENROLLMENT_EXTENSION_OIDS,
  POLICY_KEY_ALGORITHM_TO_REQUEST,
  POLICY_SIGNATURE_ALGORITHM_TO_REQUEST
} from "../certificate-common/certificate-constants";
import {
  CUSTOM_EXTENSION_PRESETS_BY_OID,
  describeReservedExtensionOid,
  findMicrosoftAutoenrollmentRuleProblems,
  isReservedExtensionOid,
  resolveCustomExtensions,
  TCustomExtensionRule,
  validateCustomExtensionValue
} from "../certificate-common/certificate-extension-fns";
import { assertPkiResourceInActorOrg } from "../certificate-common/pki-org-scope-fns";
import { TProjectDALFactory } from "../project/project-dal";
import { TCertificatePolicyDALFactory } from "./certificate-policy-dal";
import {
  certificatePolicyNotFoundError,
  describeDeniedSan,
  describeDisallowedSans,
  describeCommonNameSanRuleWithoutCommonName,
  describeMissingRequiredSan,
  describeTtlExceedsMax,
  describeUnsupportedCommonNameDefaultSans,
  describeValueNotAllowed,
  quotePolicyValues,
  isDomainComponentRule,
  isWildcardPattern,
  matchesNormalizedPattern,
  matchesSanRuleValue,
  normalizeUriForComparison,
  parsePolicyTtl,
  RequestReference,
  validateDomainComponentsAgainstRule
} from "./certificate-policy-fns";
import {
  TCertificatePolicy,
  TCertificatePolicyInsert,
  TCertificatePolicyUpdate,
  TCertificateRequest,
  TPolicyValidationOptions,
  TPolicyValidationResult,
  TSubjectRule
} from "./certificate-policy-types";

type TCertificatePolicyServiceFactoryDep = {
  certificatePolicyDAL: TCertificatePolicyDALFactory;
  projectPermissionService: TProjectPermissionService;
  applicationPermissionService: TApplicationPermissionService;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

const findDuplicates = (values: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
};

export const certificatePolicyServiceFactory = ({
  certificatePolicyDAL,
  projectPermissionService,
  applicationPermissionService,
  projectDAL
}: TCertificatePolicyServiceFactoryDep) => {
  const consolidateAttributeArray = <T extends { type: string }>(attributes: T[]): T[] => {
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

  const validateSubjectAttributePolicy = (subjectAttributes: TSubjectRule[]) => {
    if (!subjectAttributes || subjectAttributes.length === 0) return;

    // Validate each subject attribute policy
    for (const attr of subjectAttributes) {
      // Ensure at least one field is provided
      if (!attr.allowed && !attr.required && !attr.denied) {
        throw new ForbiddenRequestError({
          message: `The subject rule for '${attr.type}' has no values. Add at least one allowed, required or denied value, or remove the rule.`
        });
      }

      const arrays = [
        { name: "allowed", values: attr.allowed },
        { name: "required", values: attr.required },
        { name: "denied", values: attr.denied }
      ];

      for (const { name, values } of arrays) {
        const duplicates = findDuplicates(values ?? []);
        if (duplicates.length > 0) {
          throw new ForbiddenRequestError({
            message: `The ${name} list of the subject rule for '${attr.type}' repeats ${duplicates.join(", ")}. List each value once.`
          });
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
          message: `The SAN rule for '${san.type}' has no values. Add at least one allowed, required or denied value, or remove the rule.`
        });
      }

      const arrays = [
        { name: "allowed", values: san.allowed },
        { name: "required", values: san.required },
        { name: "denied", values: san.denied }
      ];

      for (const { name, values } of arrays) {
        const duplicates = findDuplicates(values ?? []);
        if (duplicates.length > 0) {
          throw new ForbiddenRequestError({
            message: `The ${name} list of the SAN rule for '${san.type}' repeats ${duplicates.join(", ")}. List each value once.`
          });
        }
      }

      const deniedValues = new Set(san.denied);
      const conflicting = (san.required ?? []).filter((value) => deniedValues.has(value));
      if (conflicting.length > 0) {
        throw new BadRequestError({
          message: `SAN rule for type '${san.type}' both requires and denies ${conflicting
            .map((value) => (value === RequestReference.CommonName ? `"Same as common name" (${value})` : value))
            .join(", ")}, so no request could ever satisfy it.`
        });
      }
    }
  };

  const validateCustomExtensionPolicy = (customExtensions: TCustomExtensionRule[]) => {
    if (customExtensions.length > MAX_CUSTOM_EXTENSION_RULES_PER_POLICY) {
      throw new BadRequestError({
        message: `A policy cannot have more than ${MAX_CUSTOM_EXTENSION_RULES_PER_POLICY} custom extension rules`
      });
    }

    const seenOids = new Set<string>();
    for (const rule of customExtensions) {
      if (seenOids.has(rule.oid)) {
        throw new BadRequestError({
          message: `Duplicate custom extension rule for OID '${rule.oid}'. Each OID must appear only once.`
        });
      }
      seenOids.add(rule.oid);

      if (isReservedExtensionOid(rule.oid)) {
        throw new BadRequestError({ message: describeReservedExtensionOid(rule.oid) });
      }

      const patterns = [...(rule.allowed ?? []), ...(rule.required ?? []), ...(rule.denied ?? [])];
      for (const pattern of patterns) {
        if (isWildcardPattern(pattern)) {
          // eslint-disable-next-line no-continue
          continue;
        }
        const invalid = validateCustomExtensionValue(rule.oid, pattern);
        if (invalid) {
          throw new BadRequestError({
            message: `Custom extension rule for OID '${rule.oid}' lists '${pattern}', which this extension can never take, so the rule would never apply. ${invalid}. Patterns may use * as a wildcard to cover a range of values.`
          });
        }
      }

      const conflicting = (rule.required ?? []).filter((pattern) => (rule.denied ?? []).includes(pattern));
      if (conflicting.length > 0) {
        throw new BadRequestError({
          message: `Custom extension rule for OID '${rule.oid}' both requires and denies ${conflicting.join(", ")}, so no value could ever satisfy it.`
        });
      }

      const preset = CUSTOM_EXTENSION_PRESETS_BY_OID[rule.oid];
      if (preset && rule.critical) {
        throw new BadRequestError({
          message: `Custom extension '${rule.oid}' is always emitted as ${preset.critical ? "critical" : "non-critical"}, so its criticality cannot be constrained.`
        });
      }
    }
  };

  // slugify adds a hyphen at each camelCase boundary, so a name within the route's 255 limit can still outgrow the
  // 255-character name column; a cut can also end on a hyphen, which a slug may not.
  const truncateSlug = (slug: string, maxLength: number) => slug.slice(0, maxLength).replace(/-+$/, "");

  const generateTemplateSlug = (baseName?: string): string => {
    if (baseName) {
      return truncateSlug(slugify(baseName), 255);
    }
    return slugify(alphaNumericNanoId(12));
  };

  const ensureUniqueSlug = async (projectId: string, desiredSlug: string, policyId?: string): Promise<string> => {
    const existingTemplate = await certificatePolicyDAL.findByNameAndProjectId(desiredSlug, projectId);
    if (!existingTemplate || (policyId && existingTemplate.id === policyId)) {
      return desiredSlug;
    }
    const alternativeSlug = `${truncateSlug(desiredSlug, 246)}-${alphaNumericNanoId(8)}`;
    const existingAlternative = await certificatePolicyDAL.findByNameAndProjectId(alternativeSlug, projectId);
    if (!existingAlternative) {
      return alternativeSlug;
    }

    const randomSlug = slugify(alphaNumericNanoId(12));
    return randomSlug;
  };

  const mapTemplateSignatureAlgorithmToApi = (templateFormat: string): string =>
    POLICY_SIGNATURE_ALGORITHM_TO_REQUEST[templateFormat] || templateFormat;

  const mapTemplateKeyAlgorithmToApi = (templateFormat: string): string =>
    POLICY_KEY_ALGORITHM_TO_REQUEST[templateFormat] || templateFormat;

  const validateKeyUsagePolicy = (keyUsages: { allowed?: string[]; required?: string[]; denied?: string[] }) => {
    if (!keyUsages) return;

    if (!keyUsages.allowed && !keyUsages.required && !keyUsages.denied) {
      throw new BadRequestError({
        message:
          "The key usage rule has no values. Add at least one allowed, required or denied key usage, or remove the rule."
      });
    }

    const arrays = [
      { name: "allowed", values: keyUsages.allowed },
      { name: "required", values: keyUsages.required },
      { name: "denied", values: keyUsages.denied }
    ];

    for (const { name, values } of arrays) {
      const duplicates = findDuplicates(values ?? []);
      if (duplicates.length > 0) {
        throw new BadRequestError({
          message: `The ${name} key usages list repeats ${duplicates.join(", ")}. List each key usage once.`
        });
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
      throw new BadRequestError({
        message:
          "The extended key usage rule has no values. Add at least one allowed, required or denied extended key usage, or remove the rule."
      });
    }

    const arrays = [
      { name: "allowed", values: extendedKeyUsages.allowed },
      { name: "required", values: extendedKeyUsages.required },
      { name: "denied", values: extendedKeyUsages.denied }
    ];

    for (const { name, values } of arrays) {
      const duplicates = findDuplicates(values ?? []);
      if (duplicates.length > 0) {
        throw new BadRequestError({
          message: `The ${name} extended key usages list repeats ${duplicates.join(", ")}. List each extended key usage once.`
        });
      }
    }
  };

  const validateValueAgainstConstraints = (
    value: string,
    allowedValues: string[],
    fieldName: string,
    isUri = false
  ): { isValid: boolean; error?: string } => {
    if (!allowedValues || allowedValues.length === 0) {
      return { isValid: true };
    }

    const normalize = (input: string): string => (isUri ? normalizeUriForComparison(input) : input.toLowerCase());
    const hasWildcards = allowedValues.some(isWildcardPattern);
    const normalizedValue = normalize(value);

    for (const allowedValue of allowedValues) {
      if (matchesNormalizedPattern(normalizedValue, normalize(allowedValue))) {
        return { isValid: true };
      }
    }

    return {
      isValid: false,
      error: describeValueNotAllowed({ fieldName, value, allowedValues, hasPatterns: hasWildcards })
    };
  };

  const describeAllowedTypes = (label: string, allowed: string[]): string =>
    allowed.length > 0 ? `Allowed ${label}: ${[...new Set(allowed)].join(", ")}` : `The policy allows no ${label}`;

  const validateRequestAgainstPolicy = (
    template: TCertificatePolicy,
    request: TCertificateRequest,
    options?: TPolicyValidationOptions
  ): TPolicyValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let ttlExceedsMax = false;

    // Validate subject attributes
    const subjectPolicies = template.subject;
    const requestAttributes = new Map<string, string>();
    if (request.commonName) requestAttributes.set(CertSubjectAttributeType.COMMON_NAME, request.commonName);
    if (request.organization) {
      requestAttributes.set(CertSubjectAttributeType.ORGANIZATION, request.organization);
    }
    if (request.organizationalUnit)
      requestAttributes.set(CertSubjectAttributeType.ORGANIZATIONAL_UNIT, request.organizationalUnit);
    if (request.country) requestAttributes.set(CertSubjectAttributeType.COUNTRY, request.country);
    if (request.state) requestAttributes.set(CertSubjectAttributeType.STATE, request.state);
    if (request.locality) requestAttributes.set(CertSubjectAttributeType.LOCALITY, request.locality);

    if (subjectPolicies) {
      const singleValuedPolicies = subjectPolicies.filter((attrPolicy) => !isDomainComponentRule(attrPolicy));
      for (const attrPolicy of singleValuedPolicies) {
        const requestValue = requestAttributes.get(attrPolicy.type);

        if (!options?.skipRequired && attrPolicy.required && attrPolicy.required.length > 0) {
          if (!requestValue) {
            errors.push(
              `The request is missing the required ${attrPolicy.type} attribute. The policy requires a value matching: ${quotePolicyValues(attrPolicy.required)}`
            );
          } else {
            const hasMatchingRequired = attrPolicy.required.some((requiredValue) => {
              const validation = validateValueAgainstConstraints(requestValue, [requiredValue], attrPolicy.type);
              return validation.isValid;
            });
            if (!hasMatchingRequired) {
              errors.push(
                `${attrPolicy.type} value '${requestValue}' does not match any required patterns: ${quotePolicyValues(attrPolicy.required)}`
              );
            }
          }
        }

        if (requestValue) {
          let isValueDenied = false;
          if (attrPolicy.denied && attrPolicy.denied.length > 0) {
            const validation = validateValueAgainstConstraints(requestValue, attrPolicy.denied, attrPolicy.type);
            if (validation.isValid) {
              errors.push(
                `${attrPolicy.type} value '${requestValue}' is denied by the policy. Denied values: ${quotePolicyValues(attrPolicy.denied)}`
              );
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
          errors.push(
            `Subject attribute ${attrType} is not allowed by the policy. ${describeAllowedTypes(
              "subject attributes",
              subjectPolicies.map((policy) => policy.type)
            )}`
          );
        }
      }
    }

    const domainComponentPolicy = subjectPolicies?.find(isDomainComponentRule);
    const requestDomainComponents = request.domainComponents ?? [];
    if (domainComponentPolicy) {
      errors.push(
        ...validateDomainComponentsAgainstRule({
          requestDomainComponents,
          rule: domainComponentPolicy,
          skipRequired: options?.skipRequired
        })
      );
    } else if (subjectPolicies && requestDomainComponents.length > 0) {
      // A subject policy is defined but has no domain_component rule, so DCs aren't
      // permitted. When no subject policy is defined at all, every subject attribute is allowed.
      errors.push(
        `Subject attribute ${CertSubjectAttributeType.DOMAIN_COMPONENT} is not allowed by the policy. ${describeAllowedTypes(
          "subject attributes",
          subjectPolicies.map((policy) => policy.type)
        )}`
      );
    }

    // Validate Subject Alternative Names. An undefined SAN policy means no constraint (allow all);
    // an empty array means nothing is allowed, so every request SAN below is rejected as uncovered.
    const sansPolicies = template.sans;
    if (sansPolicies) {
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

        const isUriSan = sanPolicy.type === CertSubjectAlternativeNameType.URI;
        const matchesRuleValue = (sanValue: string, ruleValue: string) =>
          matchesSanRuleValue({
            sanType: sanPolicy.type,
            sanValue,
            ruleValue,
            commonName: request.commonName,
            matchesPattern: (value, pattern) =>
              validateValueAgainstConstraints(value, [pattern], `${sanPolicy.type} SAN`, isUriSan).isValid
          });

        // Check REQUIRED values - at least one SAN must match each required pattern
        if (!options?.skipRequired && sanPolicy.required && sanPolicy.required.length > 0) {
          for (const requiredValue of sanPolicy.required) {
            if (!requestSans.some((sanValue) => matchesRuleValue(sanValue, requiredValue))) {
              errors.push(describeMissingRequiredSan(sanPolicy.type, requiredValue, request.commonName));
            }
          }
        }

        // Check DENIED values - no SAN should match denied patterns
        if (sanPolicy.denied && sanPolicy.denied.length > 0) {
          for (const sanValue of requestSans) {
            const deniedValue = sanPolicy.denied.find((ruleValue) => matchesRuleValue(sanValue, ruleValue));
            if (deniedValue) {
              errors.push(describeDeniedSan(sanPolicy.type, sanValue, deniedValue));
            }
          }
        }

        // Check ALLOWED values - if present, all SANs must match at least one allowed pattern
        if (sanPolicy.allowed && sanPolicy.allowed.length > 0 && requestSans.length > 0) {
          const permittedValues = [...(sanPolicy.required ?? []), ...sanPolicy.allowed];
          const disallowedSans = requestSans.filter(
            (sanValue) => !permittedValues.some((ruleValue) => matchesRuleValue(sanValue, ruleValue))
          );
          if (disallowedSans.length > 0) {
            errors.push(describeDisallowedSans(sanPolicy.type, disallowedSans, permittedValues, request.commonName));
          }
        }
      }

      // Check if any request SANs are for types not covered by template policies
      for (const [requestSanType] of requestSansByType) {
        const hasPolicy = sansPolicies.some((policy) => policy.type === requestSanType);
        if (!hasPolicy) {
          errors.push(
            `SAN type ${requestSanType} is not allowed by the policy. ${describeAllowedTypes(
              "SAN types",
              sansPolicies.map((policy) => policy.type)
            )}`
          );
        }
      }
    }

    // Validate key usages
    const keyUsagePolicy = template.keyUsages;
    if (keyUsagePolicy) {
      // Check REQUIRED key usages - must have all required usages
      if (!options?.skipRequired && keyUsagePolicy.required && keyUsagePolicy.required.length > 0) {
        const missingRequired = keyUsagePolicy.required.filter((usage) => !request.keyUsages?.includes(usage));
        if (missingRequired.length > 0) {
          errors.push(
            `The request is missing the required key usages: ${missingRequired.join(", ")}. Add them to the request's key usages`
          );
        }
      }

      // Check DENIED key usages - must not have any denied usages
      if (request.keyUsages && keyUsagePolicy.denied && keyUsagePolicy.denied.length > 0) {
        const deniedUsages = request.keyUsages.filter((usage) => keyUsagePolicy?.denied?.includes(usage));
        if (deniedUsages.length > 0) {
          errors.push(
            `The request includes key usages the policy denies: ${deniedUsages.join(", ")}. Remove them from the request`
          );
        }
      }

      // Check ALLOWED key usages - if present, all usages must be in allowed list
      if (request.keyUsages && keyUsagePolicy) {
        const allAllowedUsages = [...(keyUsagePolicy.required || []), ...(keyUsagePolicy.allowed || [])];
        const invalidUsages = request.keyUsages.filter((usage) => !allAllowedUsages.includes(usage));
        if (invalidUsages.length > 0) {
          errors.push(
            `The request includes key usages the policy does not allow: ${invalidUsages.join(", ")}. ${describeAllowedTypes("key usages", allAllowedUsages)}`
          );
        }
      }
    }
    // No key usage policy defined means no key usage constraint (allow all)

    // Validate extended key usages
    const extendedKeyUsagePolicy = template.extendedKeyUsages;
    if (extendedKeyUsagePolicy) {
      // Check REQUIRED extended key usages - must have all required usages
      if (!options?.skipRequired && extendedKeyUsagePolicy.required && extendedKeyUsagePolicy.required.length > 0) {
        const missingRequired = extendedKeyUsagePolicy.required.filter(
          (usage) => !request.extendedKeyUsages?.includes(usage)
        );
        if (missingRequired.length > 0) {
          errors.push(
            `The request is missing the required extended key usages: ${missingRequired.join(", ")}. Add them to the request's extended key usages`
          );
        }
      }

      // Check DENIED extended key usages - must not have any denied usages
      if (request.extendedKeyUsages && extendedKeyUsagePolicy.denied && extendedKeyUsagePolicy.denied.length > 0) {
        const deniedUsages = request.extendedKeyUsages.filter((usage) =>
          extendedKeyUsagePolicy?.denied?.includes(usage)
        );
        if (deniedUsages.length > 0) {
          errors.push(
            `The request includes extended key usages the policy denies: ${deniedUsages.join(", ")}. Remove them from the request`
          );
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
          errors.push(
            `The request includes extended key usages the policy does not allow: ${invalidExtendedUsages.join(", ")}. ${describeAllowedTypes("extended key usages", allAllowedExtendedUsages)}`
          );
        }
      }
    }
    // No extended key usage policy defined means no EKU constraint (allow all)

    // An undefined algorithm policy means no algorithm constraint (allow all).
    if (request.signatureAlgorithm && template.algorithms?.signature && template.algorithms.signature.length > 0) {
      const mappedTemplateAlgorithms = template.algorithms.signature.map(mapTemplateSignatureAlgorithmToApi);
      if (!mappedTemplateAlgorithms.includes(request.signatureAlgorithm)) {
        errors.push(
          `Signature algorithm '${request.signatureAlgorithm}' is not allowed by the policy. Allowed signature algorithms: ${mappedTemplateAlgorithms.join(", ")}`
        );
      }
    }

    if (request.keyAlgorithm && template.algorithms?.keyAlgorithm && template.algorithms.keyAlgorithm.length > 0) {
      const mappedTemplateKeyTypes = template.algorithms.keyAlgorithm.map(mapTemplateKeyAlgorithmToApi);
      if (!mappedTemplateKeyTypes.includes(request.keyAlgorithm)) {
        errors.push(
          `Key algorithm '${request.keyAlgorithm}' is not allowed by the policy. Allowed key algorithms: ${mappedTemplateKeyTypes.join(", ")}`
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
      errors.push(
        `notBefore (${request.notBefore.toISOString()}) must be earlier than notAfter (${request.notAfter.toISOString()})`
      );
    }

    // A policy reads m as months, but a request ttl reads m as minutes, so give a month limit in days.
    const isMonthsMax = Boolean(template.validity?.max?.endsWith("m"));
    const requestableMax =
      template.validity?.max && isMonthsMax ? `${parseInt(template.validity.max, 10) * 30}d` : template.validity?.max;
    const maxWithDays = template.validity?.max
      ? `'${template.validity.max}'${isMonthsMax ? ` (${requestableMax})` : ""}`
      : "";

    // Validate TTL against template validity constraints
    if (request.validity?.ttl && template.validity) {
      const requestDurationMs = parsePolicyTtl(request.validity.ttl);

      // Check maximum duration using max field
      if (template.validity.max) {
        const maxDurationMs = parsePolicyTtl(template.validity.max);

        if (requestDurationMs > maxDurationMs) {
          ttlExceedsMax = true;
          errors.push(describeTtlExceedsMax(request.validity.ttl, maxWithDays, requestableMax));
        }
      }
    }
    // Validate explicit date range against max duration
    if ((request.notBefore || request.notAfter) && template.validity?.max) {
      const notBefore = request.notBefore || new Date();
      const { notAfter } = request;

      if (notAfter && notBefore && notAfter instanceof Date && notBefore instanceof Date) {
        const requestDuration = notAfter.getTime() - notBefore.getTime();
        const maxDurationMs = parsePolicyTtl(template.validity.max);

        if (requestDuration > maxDurationMs) {
          errors.push(
            `Requested validity from notBefore ${notBefore.toISOString()} to notAfter ${notAfter.toISOString()} exceeds the policy's maximum of ${maxWithDays}. Shorten the range to ${requestableMax} or less`
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
    } else if (!options?.skipRequired && isCaPolicy === CertPolicyState.REQUIRED) {
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

    const { extensions: resolvedCustomExtensions, errors: customExtensionErrors } = resolveCustomExtensions({
      declarations: options?.profileCustomExtensions,
      rules: template.customExtensions,
      requestExtensions: request.customExtensions,
      skipRequired: options?.skipRequired,
      issuerAddedExtensions: options?.issuerAddedExtensions
    });
    errors.push(...customExtensionErrors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      resolvedCustomExtensions,
      ttlExceedsMax
    };
  };

  const createPolicy = async ({
    actor,
    projectId,
    data
  }: {
    actor: TActorContext;
    projectId: string;
    data: Omit<TCertificatePolicyInsert, "projectId">;
  }): Promise<TCertificatePolicy> => {
    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionCertificatePolicyActions.Create,
      subject: ProjectPermissionSub.CertificatePolicies,
      fields: {
        name: data.name
      }
    });

    if (!data) {
      throw new Error("Template data is required");
    }

    const consolidatedData = {
      ...data,
      subject: data.subject ? consolidateAttributeArray(data.subject) : data.subject,
      sans: data.sans ? consolidateAttributeArray(data.sans) : data.sans
    };

    if (consolidatedData.subject) {
      validateSubjectAttributePolicy(consolidatedData.subject);
    }

    if (consolidatedData.sans) {
      validateSanPolicy(consolidatedData.sans);
    }

    const commonNameSanRuleError = describeCommonNameSanRuleWithoutCommonName({
      subject: consolidatedData.subject ?? undefined,
      sans: consolidatedData.sans ?? undefined
    });
    if (commonNameSanRuleError) {
      throw new BadRequestError({ message: commonNameSanRuleError });
    }

    if (consolidatedData.keyUsages) {
      validateKeyUsagePolicy(consolidatedData.keyUsages);
    }

    if (consolidatedData.extendedKeyUsages) {
      validateExtendedKeyUsagePolicy(consolidatedData.extendedKeyUsages);
    }

    // Generate slug from name and ensure it's unique within project
    if (consolidatedData.customExtensions) {
      validateCustomExtensionPolicy(consolidatedData.customExtensions);
    }

    if (!data.name) {
      throw new BadRequestError({ message: "A certificate policy needs a name. Set name in the request." });
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
    policyId,
    data
  }: {
    actor: TActorContext;
    policyId: string;
    data: TCertificatePolicyUpdate;
  }): Promise<TCertificatePolicy> => {
    const existingTemplate = await certificatePolicyDAL.findById(policyId);
    if (!existingTemplate) {
      throw certificatePolicyNotFoundError(policyId);
    }
    await assertPkiResourceInActorOrg({
      projectDAL,
      projectId: existingTemplate.projectId,
      actorOrgId: actor.org.id,
      notFoundError: () => certificatePolicyNotFoundError(policyId)
    });

    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId: existingTemplate.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionCertificatePolicyActions.Edit,
      subject: ProjectPermissionSub.CertificatePolicies,
      fields: {
        name: existingTemplate.name
      }
    });

    const consolidatedData = {
      ...data,
      subject: data.subject ? consolidateAttributeArray(data.subject) : data.subject,
      sans: data.sans ? consolidateAttributeArray(data.sans) : data.sans
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

    const isChangingNames = consolidatedData.subject !== undefined || consolidatedData.sans !== undefined;
    const boundProfiles =
      consolidatedData.customExtensions || isChangingNames
        ? await certificatePolicyDAL.getProfilesUsingPolicy(policyId)
        : [];

    if (consolidatedData.customExtensions) {
      validateCustomExtensionPolicy(consolidatedData.customExtensions);

      for (const boundProfile of boundProfiles) {
        const declarations = boundProfile.defaults?.customExtensions;
        if (declarations?.length) {
          const { errors } = resolveCustomExtensions({
            declarations,
            rules: consolidatedData.customExtensions,
            skipRequired: true
          });
          if (errors.length) {
            throw new BadRequestError({
              message: `Certificate profile '${boundProfile.slug}' uses this policy and would no longer be valid. ${errors.join(" ")}`
            });
          }
        }
      }
    }

    if (isChangingNames) {
      const updatedPolicy: Pick<TCertificatePolicy, "subject" | "sans"> = {
        subject:
          (consolidatedData.subject === undefined ? existingTemplate.subject : consolidatedData.subject) ?? undefined,
        sans: (consolidatedData.sans === undefined ? existingTemplate.sans : consolidatedData.sans) ?? undefined
      };
      const commonNameSanRuleError = describeCommonNameSanRuleWithoutCommonName(updatedPolicy);
      if (commonNameSanRuleError) {
        throw new BadRequestError({ message: commonNameSanRuleError });
      }
      for (const boundProfile of boundProfiles) {
        const error = describeUnsupportedCommonNameDefaultSans(
          updatedPolicy,
          boundProfile.defaults?.subjectAltNames ?? []
        );
        if (error) {
          throw new BadRequestError({
            message: `Certificate profile '${boundProfile.slug}' uses this policy and would no longer be valid. ${error}`
          });
        }
      }
    }

    const updateData = { ...consolidatedData };
    if (data.name && typeof data.name === "string") {
      const newSlug = generateTemplateSlug(data.name);
      if (newSlug !== existingTemplate.name) {
        const uniqueSlug = await ensureUniqueSlug(existingTemplate.projectId, newSlug, policyId);
        updateData.name = uniqueSlug;
      }
    }

    const windowsRuleProblems = consolidatedData.customExtensions
      ? findMicrosoftAutoenrollmentRuleProblems(consolidatedData.customExtensions)
      : [];
    const updatedTemplate = await certificatePolicyDAL.transaction(async (tx) => {
      if (windowsRuleProblems.length || consolidatedData.algorithms !== undefined) {
        await certificatePolicyDAL.lockById(policyId, tx);
        const windowsProfiles = await certificatePolicyDAL.findMicrosoftAutoenrollmentProfiles(policyId, tx);
        const [windowsProfile] = windowsProfiles;
        if (windowsProfile && windowsRuleProblems.length) {
          throw new BadRequestError({
            message: `Certificate profile '${windowsProfile.profileName}' uses this policy with Microsoft Autoenrollment in Application '${windowsProfile.applicationName}', which adds custom extensions ${MICROSOFT_AUTOENROLLMENT_EXTENSION_OIDS.join(" and ")} to every certificate. ${windowsRuleProblems.join(" ")} You can also turn off Microsoft Autoenrollment for that profile.`
          });
        }
        const updatedPolicy = { ...existingTemplate, ...updateData } as TCertificatePolicy;
        for (const { profileName, profileDefaults, applicationName, caKeyAlgorithm, caKeySource } of windowsProfiles) {
          const keyProblem = findTemplatePolicyProblem(
            { slug: profileName, defaults: profileDefaults },
            { keyAlgorithm: caKeyAlgorithm, keySource: caKeySource },
            (request) => validateRequestAgainstPolicy(updatedPolicy, request, { skipRequired: true }).isValid
          );
          if (keyProblem) {
            throw new BadRequestError({
              message: `Certificate profile '${profileName}' uses this policy with Microsoft Autoenrollment in Application '${applicationName}'. ${keyProblem}`
            });
          }
        }
      }
      return certificatePolicyDAL.updateById(policyId, updateData, tx);
    });
    if (!updatedTemplate) {
      throw new NotFoundError({ message: "Failed to update certificate policy" });
    }
    return updatedTemplate;
  };

  const getPolicyById = async ({
    actor,
    policyId,
    applicationId,
    internal = false
  }: {
    actor?: TActorContext;
    policyId: string;
    applicationId?: string;
    internal?: boolean;
  }): Promise<TCertificatePolicy> => {
    const template = await certificatePolicyDAL.findById(policyId);
    if (!template) {
      throw certificatePolicyNotFoundError(policyId);
    }

    if (!internal) {
      if (!actor) {
        throw new BadRequestError({ message: "Actor is required" });
      }

      await assertPkiResourceInActorOrg({
        projectDAL,
        projectId: template.projectId,
        actorOrgId: actor.org.id,
        notFoundError: () => certificatePolicyNotFoundError(policyId)
      });

      if (applicationId && (actor.principal.type === ActorType.USER || actor.principal.type === ActorType.IDENTITY)) {
        const permission = await applicationPermissionService.getApplicationPermission({
          actor,
          projectId: template.projectId,
          applicationId
        });

        permission.assert({
          action: ApplicationPermissionActions.Read,
          subject: ApplicationPermissionSub.Application
        });
      } else {
        const permission = await projectPermissionService.getProjectPermission({
          actor,
          projectId: template.projectId,
          type: ProjectType.CertificateManager
        });

        permission.assert({
          action: ProjectPermissionCertificatePolicyActions.Read,
          subject: ProjectPermissionSub.CertificatePolicies,
          fields: {
            name: template.name
          }
        });
      }
    }

    return template;
  };

  const getPolicyBySlug = async ({
    actor,
    projectId,
    slug
  }: {
    actor: TActorContext;
    projectId: string;
    slug: string;
  }): Promise<TCertificatePolicy> => {
    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.CertificateManager
    });

    const template = await certificatePolicyDAL.findByNameAndProjectId(slug, projectId);
    if (!template) {
      throw new NotFoundError({
        message: `Certificate policy named '${slug}' not found in this organization. List your organization's certificate policies with GET /api/v1/cert-manager/certificate-policies to find the right name.`
      });
    }

    permission.assert({
      action: ProjectPermissionCertificatePolicyActions.Read,
      subject: ProjectPermissionSub.CertificatePolicies,
      fields: {
        name: template.name
      }
    });
    return template;
  };

  const listPolicies = async ({
    actor,
    projectId,
    offset = 0,
    limit = 20,
    search
  }: {
    actor: TActorContext;
    projectId: string;
    offset?: number;
    limit?: number;
    search?: string;
  }): Promise<{
    policies: TCertificatePolicy[];
    totalCount: number;
  }> => {
    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionCertificatePolicyActions.Read,
      subject: ProjectPermissionSub.CertificatePolicies
    });

    const processedRules = getProcessedPermissionRules(
      permission.toAbility(),
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
    policyId
  }: {
    actor: TActorContext;
    policyId: string;
  }): Promise<TCertificatePolicy> => {
    const template = await certificatePolicyDAL.findById(policyId);
    if (!template) {
      throw certificatePolicyNotFoundError(policyId);
    }
    await assertPkiResourceInActorOrg({
      projectDAL,
      projectId: template.projectId,
      actorOrgId: actor.org.id,
      notFoundError: () => certificatePolicyNotFoundError(policyId)
    });

    const permission = await projectPermissionService.getProjectPermission({
      actor,
      projectId: template.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({
      action: ProjectPermissionCertificatePolicyActions.Delete,
      subject: ProjectPermissionSub.CertificatePolicies,
      fields: {
        name: template.name
      }
    });

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

    return deletedTemplate;
  };

  const validateCertificateRequest = async (
    policyId: string,
    request: TCertificateRequest,
    options?: TPolicyValidationOptions
  ): Promise<TPolicyValidationResult> => {
    const policy = await certificatePolicyDAL.findById(policyId);
    if (!policy) {
      throw certificatePolicyNotFoundError(policyId);
    }

    return validateRequestAgainstPolicy(policy, request, options);
  };

  return {
    createPolicy,
    updatePolicy,
    getPolicyById,
    getPolicyBySlug,
    listPolicies,
    deletePolicy,
    validateCertificateRequest,
    validateRequestAgainstPolicy
  };
};

export type TCertificatePolicyServiceFactory = ReturnType<typeof certificatePolicyServiceFactory>;
