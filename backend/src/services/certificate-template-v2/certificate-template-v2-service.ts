import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import RE2 from "re2";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { CertIncludeType, CertSubjectAttributeType } from "../certificate-common/certificate-constants";
import { TCertificateTemplateV2DALFactory } from "./certificate-template-v2-dal";
import {
  TCertificateRequest,
  TCertificateTemplateV2,
  TCertificateTemplateV2Insert,
  TCertificateTemplateV2Update,
  TTemplateValidationResult
} from "./certificate-template-v2-types";

type TCertificateTemplateV2ServiceFactoryDep = {
  certificateTemplateV2DAL: TCertificateTemplateV2DALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateTemplateV2ServiceFactory = ReturnType<typeof certificateTemplateV2ServiceFactory>;

export const certificateTemplateV2ServiceFactory = ({
  certificateTemplateV2DAL,
  permissionService
}: TCertificateTemplateV2ServiceFactoryDep) => {
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

  const convertToMilliseconds = (value: number, unit: "days" | "months" | "years"): number => {
    switch (unit) {
      case "days":
        return value * 24 * 60 * 60 * 1000;
      case "months":
        return value * 30 * 24 * 60 * 60 * 1000;
      case "years":
        return value * 365 * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unsupported duration unit: ${unit as string}`);
    }
  };

  const validateSubjectAttributePolicy = (attributes: Array<{ type: string; include: string; value?: string[] }>) => {
    if (!attributes || attributes.length === 0) return;

    const attributesByType = attributes.reduce(
      (acc, attr) => {
        if (!acc[attr.type]) acc[attr.type] = [];
        acc[attr.type].push(attr);
        return acc;
      },
      {} as Record<string, typeof attributes>
    );

    for (const [type, attrs] of Object.entries(attributesByType)) {
      const mandatoryAttrs = attrs.filter((attr) => attr.include === CertIncludeType.MANDATORY);

      if (mandatoryAttrs.length > 1) {
        throw new ForbiddenRequestError({
          message: `Multiple mandatory values found for subject attribute type '${type}'. Only one mandatory value is allowed per attribute type.`
        });
      }

      if (mandatoryAttrs.length === 1 && attrs.length > 1) {
        throw new ForbiddenRequestError({
          message: `When a mandatory value exists for subject attribute type '${type}', no other values (optional or forbidden) are allowed for that attribute type.`
        });
      }
    }
  };

  const getRequestAttributeValue = (
    request: TCertificateRequest,
    attrType: CertSubjectAttributeType | string
  ): string | undefined => {
    switch (attrType) {
      case CertSubjectAttributeType.COMMON_NAME:
      case "common_name":
        return request.commonName;
      default:
        return undefined;
    }
  };

  const generateTemplateSlug = (baseSlug?: string): string => {
    if (baseSlug) {
      return slugify(baseSlug);
    }
    return slugify(alphaNumericNanoId(12));
  };

  const ensureUniqueSlug = async (projectId: string, desiredSlug: string, templateId?: string): Promise<string> => {
    const existingTemplate = await certificateTemplateV2DAL.findBySlugAndProjectId(desiredSlug, projectId);
    if (!existingTemplate || (templateId && existingTemplate.id === templateId)) {
      return desiredSlug;
    }
    const alternativeSlug = `${desiredSlug}-${alphaNumericNanoId(8)}`;
    const existingAlternative = await certificateTemplateV2DAL.findBySlugAndProjectId(alternativeSlug, projectId);
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
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regexPattern = escaped.replace(/\*/g, ".*");
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
      "RSA-4096": "RSA_4096",
      "ECDSA-P256": "EC_prime256v1",
      "ECDSA-P384": "EC_secp384r1"
    };
    return mapping[templateFormat] || templateFormat;
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
        } catch {
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
    template: TCertificateTemplateV2,
    request: TCertificateRequest
  ): TTemplateValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const templateAttributeTypes = new Set(template.attributes?.map((attr) => attr.type) || []);

    const attributePoliciesByType = new Map<string, typeof template.attributes>();
    template.attributes?.forEach((attrPolicy) => {
      const existing = attributePoliciesByType.get(attrPolicy.type) || [];
      attributePoliciesByType.set(attrPolicy.type, [...existing, attrPolicy]);
    });

    for (const [attrType, policies] of attributePoliciesByType) {
      const requestValue = getRequestAttributeValue(request, attrType);

      const hasMandatory = policies.some((p) => p.include === CertIncludeType.MANDATORY);
      const hasProhibit = policies.some((p) => p.include === CertIncludeType.PROHIBIT);

      if (hasProhibit && requestValue) {
        errors.push(`${attrType} is prohibited by template policy`);
        // eslint-disable-next-line no-continue
        continue;
      }

      if (hasMandatory && !requestValue) {
        errors.push(`${attrType} is mandatory but not provided in request`);
        // eslint-disable-next-line no-continue
        continue;
      }

      if (requestValue) {
        const policiesWithValues = policies.filter(
          (p) =>
            p.value &&
            p.value.length > 0 &&
            (p.include === CertIncludeType.MANDATORY || p.include === CertIncludeType.OPTIONAL)
        );

        if (policiesWithValues.length > 0) {
          const allAllowedValues = policiesWithValues.flatMap((p) => p.value || []);

          const validation = validateValueAgainstConstraints(requestValue, allAllowedValues, attrType);
          if (!validation.isValid && validation.error) {
            errors.push(validation.error);
          }
        }
      }
    }

    const requestAttributeTypes: CertSubjectAttributeType[] = [];
    if (request.commonName) requestAttributeTypes.push(CertSubjectAttributeType.COMMON_NAME);

    for (const requestAttrType of requestAttributeTypes) {
      if (!templateAttributeTypes.has(requestAttrType)) {
        errors.push(`${requestAttrType} is not allowed by template policy (not defined in template)`);
      }
    }
    if (template.keyUsages) {
      if (template.keyUsages.requiredUsages && template.keyUsages.requiredUsages.all.length > 0) {
        const missingRequired = template.keyUsages.requiredUsages.all.filter(
          (usage) => !request.keyUsages?.includes(usage)
        );
        if (missingRequired.length > 0) {
          errors.push(`Missing required key usages: ${missingRequired.join(", ")}`);
        }
      }

      if (request.keyUsages && (template.keyUsages.requiredUsages || template.keyUsages.optionalUsages)) {
        const allAllowedUsages = [
          ...(template.keyUsages.requiredUsages?.all || []),
          ...(template.keyUsages.optionalUsages?.all || [])
        ];

        if (allAllowedUsages.length > 0) {
          const invalidUsages = request.keyUsages.filter((usage) => !allAllowedUsages.includes(usage));
          if (invalidUsages.length > 0) {
            errors.push(`Invalid key usages: ${invalidUsages.join(", ")}`);
          }
        }
      }
    } else if (request.keyUsages && request.keyUsages.length > 0) {
      errors.push(`Key usages are not allowed by template policy (not defined in template)`);
    }

    if (template.extendedKeyUsages) {
      if (template.extendedKeyUsages.requiredUsages && template.extendedKeyUsages.requiredUsages.all.length > 0) {
        const missingRequired = template.extendedKeyUsages.requiredUsages.all.filter(
          (usage) => !request.extendedKeyUsages?.includes(usage)
        );
        if (missingRequired.length > 0) {
          errors.push(`Missing required extended key usages: ${missingRequired.join(", ")}`);
        }
      }

      if (
        request.extendedKeyUsages &&
        (template.extendedKeyUsages.requiredUsages || template.extendedKeyUsages.optionalUsages)
      ) {
        const allAllowedUsages = [
          ...(template.extendedKeyUsages.requiredUsages?.all || []),
          ...(template.extendedKeyUsages.optionalUsages?.all || [])
        ];

        if (allAllowedUsages.length > 0) {
          const invalidUsages = request.extendedKeyUsages.filter((usage) => !allAllowedUsages.includes(usage));
          if (invalidUsages.length > 0) {
            errors.push(`Invalid extended key usages: ${invalidUsages.join(", ")}`);
          }
        }
      }
    } else if (request.extendedKeyUsages && request.extendedKeyUsages.length > 0) {
      errors.push(`Extended key usages are not allowed by template policy (not defined in template)`);
    }

    const templateSanTypes = new Set(template.subjectAlternativeNames?.map((san) => san.type) || []);

    const sanPoliciesByType = new Map<string, typeof template.subjectAlternativeNames>();
    template.subjectAlternativeNames?.forEach((sanPolicy) => {
      const existing = sanPoliciesByType.get(sanPolicy.type) || [];
      sanPoliciesByType.set(sanPolicy.type, [...existing, sanPolicy]);
    });

    for (const [sanType, policies] of sanPoliciesByType) {
      const requestSans = request.subjectAlternativeNames?.filter((san) => san.type === sanType) || [];

      const hasMandatory = policies.some((p) => p.include === CertIncludeType.MANDATORY);
      const hasProhibit = policies.some((p) => p.include === CertIncludeType.PROHIBIT);

      if (hasProhibit && requestSans.length > 0) {
        errors.push(`${sanType} SAN is prohibited by template policy`);
        // eslint-disable-next-line no-continue
        continue;
      }

      if (hasMandatory && requestSans.length === 0) {
        errors.push(`${sanType} SAN is mandatory but not provided in request`);
        // eslint-disable-next-line no-continue
        continue;
      }

      if (requestSans.length > 0) {
        const policiesWithValues = policies.filter(
          (p) =>
            p.value &&
            p.value.length > 0 &&
            (p.include === CertIncludeType.MANDATORY || p.include === CertIncludeType.OPTIONAL)
        );

        if (policiesWithValues.length > 0) {
          const allAllowedValues = policiesWithValues.flatMap((p) => p.value || []);

          requestSans.forEach((san) => {
            const validation = validateValueAgainstConstraints(san.value, allAllowedValues, `${sanType} SAN`);
            if (!validation.isValid && validation.error) {
              errors.push(validation.error);
            }
          });
        }
      }
    }

    const requestSanTypes = new Set(request.subjectAlternativeNames?.map((san) => san.type) || []);
    for (const requestSanType of requestSanTypes) {
      if (!templateSanTypes.has(requestSanType)) {
        errors.push(`${requestSanType} SAN is not allowed by template policy (not defined in template)`);
      }
    }

    if (request.signatureAlgorithm) {
      if (template.signatureAlgorithm && template.signatureAlgorithm.allowedAlgorithms) {
        const mappedTemplateAlgorithms = template.signatureAlgorithm.allowedAlgorithms.map(
          mapTemplateSignatureAlgorithmToApi
        );
        if (!mappedTemplateAlgorithms.includes(request.signatureAlgorithm)) {
          errors.push(`Signature algorithm '${request.signatureAlgorithm}' is not allowed by template policy`);
        }
      } else if (!template.signatureAlgorithm) {
        errors.push(
          `Signature algorithm '${request.signatureAlgorithm}' is not allowed by template policy (not defined in template)`
        );
      }
    }

    if (request.keyAlgorithm) {
      if (template.keyAlgorithm && template.keyAlgorithm.allowedKeyTypes) {
        const mappedTemplateKeyTypes = template.keyAlgorithm.allowedKeyTypes.map(mapTemplateKeyAlgorithmToApi);
        if (!mappedTemplateKeyTypes.includes(request.keyAlgorithm)) {
          errors.push(`Key algorithm '${request.keyAlgorithm}' is not allowed by template policy`);
        }
      } else if (!template.keyAlgorithm) {
        errors.push(
          `Key algorithm '${request.keyAlgorithm}' is not allowed by template policy (not defined in template)`
        );
      }
    }

    if (request.validity?.ttl && template.validity) {
      const requestDuration = parseTTL(request.validity.ttl);
      const maxDuration = convertToMilliseconds(
        template.validity.maxDuration.value,
        template.validity.maxDuration.unit
      );

      if (requestDuration > maxDuration) {
        errors.push(`Requested validity period exceeds maximum allowed duration`);
      }

      if (template.validity.minDuration) {
        const minDuration = convertToMilliseconds(
          template.validity.minDuration.value,
          template.validity.minDuration.unit
        );
        if (requestDuration < minDuration) {
          errors.push(`Requested validity period is below minimum required duration`);
        }
      }
    }

    if (request.validity?.ttl && (request.notBefore || request.notAfter)) {
      errors.push(
        "Cannot specify both TTL and notBefore/notAfter. Use either TTL for duration-based validity or notBefore/notAfter for explicit date range."
      );
    }

    if (request.notBefore && request.notAfter && request.notBefore >= request.notAfter) {
      errors.push("notBefore must be earlier than notAfter");
    }

    if ((request.notBefore || request.notAfter) && template.validity) {
      const notBefore = request.notBefore || new Date();
      const { notAfter } = request;

      if (notAfter && notBefore && notAfter instanceof Date && notBefore instanceof Date) {
        const requestDuration = notAfter.getTime() - notBefore.getTime();

        const maxDuration = convertToMilliseconds(
          template.validity.maxDuration.value,
          template.validity.maxDuration.unit
        );

        if (requestDuration > maxDuration) {
          errors.push(`Requested validity period (notBefore to notAfter) exceeds maximum allowed duration`);
        }

        if (template.validity.minDuration) {
          const minDuration = convertToMilliseconds(
            template.validity.minDuration.value,
            template.validity.minDuration.unit
          );
          if (requestDuration < minDuration) {
            errors.push(`Requested validity period (notBefore to notAfter) is below minimum required duration`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  const createTemplateV2 = async ({
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
    data: Omit<TCertificateTemplateV2Insert, "projectId">;
  }): Promise<TCertificateTemplateV2> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.Create,
      ProjectPermissionSub.CertificateTemplates
    );

    if (!data) {
      throw new Error("Template data is required");
    }

    if (data.attributes) {
      validateSubjectAttributePolicy(data.attributes);
    }

    const slug = data.slug || generateTemplateSlug();
    const uniqueSlug = await ensureUniqueSlug(projectId, slug);

    const template = await certificateTemplateV2DAL.create({
      ...data,
      slug: uniqueSlug,
      projectId
    });

    return template;
  };

  const updateTemplateV2 = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    templateId,
    data
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    templateId: string;
    data: TCertificateTemplateV2Update;
  }): Promise<TCertificateTemplateV2> => {
    const existingTemplate = await certificateTemplateV2DAL.findById(templateId);
    if (!existingTemplate) {
      throw new NotFoundError({ message: "Certificate template not found" });
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
      ProjectPermissionPkiTemplateActions.Edit,
      ProjectPermissionSub.CertificateTemplates
    );

    if (data.attributes) {
      validateSubjectAttributePolicy(data.attributes);
    }

    const updateData = { ...data };
    if (data.slug && typeof data.slug === "string" && data.slug !== existingTemplate.slug) {
      const uniqueSlug = await ensureUniqueSlug(existingTemplate.projectId, data.slug, templateId);
      updateData.slug = uniqueSlug;
    }

    const updatedTemplate = await certificateTemplateV2DAL.updateById(templateId, updateData);
    if (!updatedTemplate) {
      throw new NotFoundError({ message: "Failed to update certificate template" });
    }
    return updatedTemplate;
  };

  const getTemplateV2ById = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    templateId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    templateId: string;
  }): Promise<TCertificateTemplateV2> => {
    const template = await certificateTemplateV2DAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found" });
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
      ProjectPermissionPkiTemplateActions.Read,
      ProjectPermissionSub.CertificateTemplates
    );

    return template;
  };

  const getTemplateV2BySlug = async ({
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
  }): Promise<TCertificateTemplateV2> => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiTemplateActions.Read,
      ProjectPermissionSub.CertificateTemplates
    );

    const template = await certificateTemplateV2DAL.findBySlugAndProjectId(slug, projectId);
    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found" });
    }

    return template;
  };

  const listTemplatesV2 = async ({
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
    templates: TCertificateTemplateV2[];
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
      ProjectPermissionPkiTemplateActions.Read,
      ProjectPermissionSub.CertificateTemplates
    );

    const templates = await certificateTemplateV2DAL.findByProjectId(projectId, {
      offset,
      limit,
      search
    });

    const totalCount = await certificateTemplateV2DAL.countByProjectId(projectId, { search });

    return {
      templates,
      totalCount
    };
  };

  const deleteTemplateV2 = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    templateId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    templateId: string;
  }): Promise<TCertificateTemplateV2> => {
    const template = await certificateTemplateV2DAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found" });
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
      ProjectPermissionPkiTemplateActions.Delete,
      ProjectPermissionSub.CertificateTemplates
    );

    const isInUse = await certificateTemplateV2DAL.isTemplateInUse(templateId);
    if (isInUse) {
      const profilesUsingTemplate = await certificateTemplateV2DAL.getProfilesUsingTemplate(templateId);
      const profileNames = profilesUsingTemplate.map((profile) => profile.slug || profile.id).join(", ");

      throw new ForbiddenRequestError({
        message:
          profilesUsingTemplate.length > 0
            ? `Cannot delete template '${template.slug}' as it is currently in use by the following certificate profiles: ${profileNames}. Please remove this template from these profiles before deleting it.`
            : `Cannot delete template '${template.slug}' as it is currently in use by one or more certificates. Please ensure no certificates are using this template before deleting it.`
      });
    }

    const deletedTemplate = await certificateTemplateV2DAL.deleteById(templateId);
    if (!deletedTemplate) {
      throw new NotFoundError({ message: "Failed to delete certificate template" });
    }
    return deletedTemplate as TCertificateTemplateV2;
  };

  const validateCertificateRequest = async (
    templateId: string,
    request: TCertificateRequest
  ): Promise<TTemplateValidationResult> => {
    const template = await certificateTemplateV2DAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Certificate template not found" });
    }

    return validateRequestAgainstPolicy(template, request);
  };

  return {
    createTemplateV2,
    updateTemplateV2,
    getTemplateV2ById,
    getTemplateV2BySlug,
    listTemplatesV2,
    deleteTemplateV2,
    validateCertificateRequest
  };
};
