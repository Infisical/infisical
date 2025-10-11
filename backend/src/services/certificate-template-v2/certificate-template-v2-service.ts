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
import { TCertificateTemplateV2DALFactory } from "./certificate-template-v2-dal";
import {
  TCertificateRequest,
  TCertificateTemplateV2,
  TCertificateTemplateV2Insert,
  TCertificateTemplateV2Update,
  TTemplateV2Policy,
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

  const getRequestAttributeValue = (request: TCertificateRequest, attrType: string): string | undefined => {
    switch (attrType) {
      case "common_name":
        return request.commonName;
      default:
        return undefined;
    }
  };

  const validateTemplatePolicy = (policy: Partial<TTemplateV2Policy>): void => {
    if (!policy) {
      throw new Error("Template policy is required");
    }

    if (!policy.attributes || policy.attributes.length === 0) {
      throw new Error("Template policy must include attributes array");
    }

    if (!policy.keyUsages || !policy.keyUsages.requiredUsages || !policy.keyUsages.optionalUsages) {
      throw new Error("Template policy must include valid key usages configuration");
    }

    if (policy.signatureAlgorithm) {
      if (!policy.signatureAlgorithm.allowedAlgorithms.includes(policy.signatureAlgorithm.defaultAlgorithm)) {
        throw new Error("Default signature algorithm must be in allowed algorithms list");
      }
    }

    if (policy.keyAlgorithm) {
      if (!policy.keyAlgorithm.allowedKeyTypes.includes(policy.keyAlgorithm.defaultKeyType)) {
        throw new Error("Default key algorithm must be in allowed key types list");
      }
    }
  };

  const hasAnyPolicyField = (data: TCertificateTemplateV2Update): boolean => {
    return !!(
      data.attributes ||
      data.keyUsages ||
      data.extendedKeyUsages ||
      data.subjectAlternativeNames ||
      data.validity ||
      data.signatureAlgorithm ||
      data.keyAlgorithm
    );
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

  const validateRequestAgainstPolicy = (
    template: TCertificateTemplateV2,
    request: TCertificateRequest
  ): TTemplateValidationResult => {
    const errors: string[] = [];

    const warnings: string[] = [];

    template.attributes?.forEach((attrPolicy) => {
      const requestValue = getRequestAttributeValue(request, attrPolicy.type);

      if (attrPolicy.include === "mandatory") {
        if (!requestValue) {
          errors.push(`${attrPolicy.type} is mandatory but not provided in request`);
        } else if (attrPolicy.value && attrPolicy.value.length > 0) {
          // Check if the request value matches any allowed pattern
          const hasWildcards = attrPolicy.value.some((val) => val.includes("*"));
          const isValidValue = attrPolicy.value.some((allowedValue) => {
            if (allowedValue.includes("*")) {
              // Handle wildcard patterns
              const pattern = allowedValue.replace(/\./g, "\\.").replace(/\*/g, ".*");
              const regex = new RE2(`^${pattern}$`);
              return regex.test(requestValue);
            }
            return allowedValue === requestValue;
          });
          if (!isValidValue) {
            if (hasWildcards) {
              errors.push(
                `${attrPolicy.type} value '${requestValue}' does not match allowed patterns: ${attrPolicy.value.join(", ")}`
              );
            } else {
              errors.push(`${attrPolicy.type} value '${requestValue}' is not in allowed values list`);
            }
          }
        }
      }

      if (attrPolicy.include === "prohibit" && requestValue) {
        errors.push(`${attrPolicy.type} is prohibited by template policy`);
      }

      if (attrPolicy.include === "optional" && requestValue && attrPolicy.value && attrPolicy.value.length > 0) {
        const hasWildcards = attrPolicy.value.some((val) => val.includes("*"));
        const isValidValue = attrPolicy.value.some((allowedValue) => {
          if (allowedValue.includes("*")) {
            // Handle wildcard patterns - escape dots and replace * with .*
            const pattern = allowedValue.replace(/\./g, "\\.").replace(/\*/g, ".*");
            const regex = new RE2(`^${pattern}$`);
            return regex.test(requestValue);
          }
          return allowedValue === requestValue;
        });
        if (!isValidValue) {
          if (hasWildcards) {
            errors.push(
              `${attrPolicy.type} value '${requestValue}' does not match allowed patterns: ${attrPolicy.value.join(", ")}`
            );
          } else {
            errors.push(`${attrPolicy.type} value '${requestValue}' is not in allowed values list`);
          }
        }
      }
    });

    if (template.keyUsages) {
      const missingRequired = template.keyUsages.requiredUsages.all.filter(
        (usage) => !request.keyUsages?.includes(usage)
      );
      if (missingRequired.length > 0) {
        errors.push(`Missing required key usages: ${missingRequired.join(", ")}`);
      }

      if (request.keyUsages) {
        const allAllowedUsages = [...template.keyUsages.requiredUsages.all, ...template.keyUsages.optionalUsages.all];
        const invalidUsages = request.keyUsages.filter((usage) => !allAllowedUsages.includes(usage));
        if (invalidUsages.length > 0) {
          errors.push(`Invalid key usages: ${invalidUsages.join(", ")}`);
        }
      }
    }

    if (template.extendedKeyUsages) {
      const missingRequired = template.extendedKeyUsages.requiredUsages.all.filter(
        (usage) => !request.extendedKeyUsages?.includes(usage)
      );
      if (missingRequired.length > 0) {
        errors.push(`Missing required extended key usages: ${missingRequired.join(", ")}`);
      }

      if (request.extendedKeyUsages) {
        const allAllowedUsages = [
          ...template.extendedKeyUsages.requiredUsages.all,
          ...template.extendedKeyUsages.optionalUsages.all
        ];
        const invalidUsages = request.extendedKeyUsages.filter((usage) => !allAllowedUsages.includes(usage));
        if (invalidUsages.length > 0) {
          errors.push(`Invalid extended key usages: ${invalidUsages.join(", ")}`);
        }
      }
    }

    template.subjectAlternativeNames?.forEach((sanPolicy) => {
      const requestSans = request.subjectAlternativeNames?.filter((san) => san.type === sanPolicy.type) || [];

      if (sanPolicy.include === "mandatory") {
        if (requestSans.length === 0) {
          errors.push(`${sanPolicy.type} SAN is mandatory but not provided in request`);
        } else if (sanPolicy.value && sanPolicy.value.length > 0) {
          const hasWildcards = sanPolicy.value.some((val) => val.includes("*"));
          requestSans.forEach((san) => {
            const isValidValue = sanPolicy.value!.some((allowedValue) => {
              if (allowedValue.includes("*")) {
                // Handle wildcard patterns - escape dots and replace * with .*
                const pattern = allowedValue.replace(/\./g, "\\.").replace(/\*/g, ".*");
                const regex = new RE2(`^${pattern}$`);
                return regex.test(san.value);
              }
              return allowedValue === san.value;
            });
            if (!isValidValue) {
              if (hasWildcards) {
                errors.push(
                  `${sanPolicy.type} SAN value '${san.value}' does not match allowed patterns: ${sanPolicy.value!.join(", ")}`
                );
              } else {
                errors.push(`${sanPolicy.type} SAN value '${san.value}' is not in allowed values list`);
              }
            }
          });
        }
      }

      if (sanPolicy.include === "prohibit" && requestSans.length > 0) {
        errors.push(`${sanPolicy.type} SAN is prohibited by template policy`);
      }

      if (sanPolicy.include === "optional" && sanPolicy.value && sanPolicy.value.length > 0) {
        const hasWildcards = sanPolicy.value.some((val) => val.includes("*"));
        requestSans.forEach((san) => {
          const isValidValue = sanPolicy.value!.some((allowedValue) => {
            if (allowedValue.includes("*")) {
              // Handle wildcard patterns - escape dots and replace * with .*
              const pattern = allowedValue.replace(/\./g, "\\.").replace(/\*/g, ".*");
              const regex = new RE2(`^${pattern}$`);
              return regex.test(san.value);
            }
            return allowedValue === san.value;
          });
          if (!isValidValue) {
            if (hasWildcards) {
              errors.push(
                `${sanPolicy.type} SAN value '${san.value}' does not match allowed patterns: ${sanPolicy.value!.join(", ")}`
              );
            } else {
              errors.push(`${sanPolicy.type} SAN value '${san.value}' is not in allowed values list`);
            }
          }
        });
      }
    });

    if (request.signatureAlgorithm && template.signatureAlgorithm) {
      if (!template.signatureAlgorithm?.allowedAlgorithms.includes(request.signatureAlgorithm)) {
        errors.push(`Signature algorithm '${request.signatureAlgorithm}' is not allowed by template policy`);
      }
    }

    if (request.keyAlgorithm && template.keyAlgorithm) {
      if (!template.keyAlgorithm?.allowedKeyTypes.includes(request.keyAlgorithm)) {
        errors.push(`Key algorithm '${request.keyAlgorithm}' is not allowed by template policy`);
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

    validateTemplatePolicy({
      attributes: data.attributes,
      keyUsages: data.keyUsages,
      extendedKeyUsages: data.extendedKeyUsages,
      subjectAlternativeNames: data.subjectAlternativeNames,
      validity: data.validity,
      signatureAlgorithm: data.signatureAlgorithm,
      keyAlgorithm: data.keyAlgorithm
    });

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

    if (hasAnyPolicyField(data)) {
      const mergedPolicy = {
        attributes: data.attributes || existingTemplate.attributes,
        keyUsages: data.keyUsages || existingTemplate.keyUsages,
        extendedKeyUsages: data.extendedKeyUsages || existingTemplate.extendedKeyUsages,
        subjectAlternativeNames: data.subjectAlternativeNames || existingTemplate.subjectAlternativeNames,
        validity: data.validity || existingTemplate.validity,
        signatureAlgorithm: data.signatureAlgorithm || existingTemplate.signatureAlgorithm,
        keyAlgorithm: data.keyAlgorithm || existingTemplate.keyAlgorithm
      };

      validateTemplatePolicy(mergedPolicy);
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
      throw new ForbiddenRequestError({
        message: "Cannot delete template that is in use by certificate profiles"
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
