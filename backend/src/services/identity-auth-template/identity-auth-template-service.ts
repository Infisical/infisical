import { ForbiddenError } from "@casl/ability";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TOrgPermission } from "@app/lib/types";

import { TIdentityLdapAuthDALFactory } from "../identity-ldap-auth/identity-ldap-auth-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TIdentityAuthTemplateDALFactory } from "./identity-auth-template-dal";
import { IdentityAuthTemplateMethod } from "./identity-auth-template-enums";
import {
  TDeleteIdentityAuthTemplateDTO,
  TFindTemplateUsagesDTO,
  TGetIdentityAuthTemplateDTO,
  TGetTemplatesByAuthMethodDTO,
  TLdapTemplateFields,
  TListIdentityAuthTemplatesDTO,
  TUnlinkTemplateUsageDTO
} from "./identity-auth-template-types";

type TIdentityAuthTemplateServiceFactoryDep = {
  identityAuthTemplateDAL: TIdentityAuthTemplateDALFactory;
  identityLdapAuthDAL: TIdentityLdapAuthDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "encryptWithInputKey" | "decryptWithInputKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityAuthTemplateServiceFactory = ReturnType<typeof identityAuthTemplateServiceFactory>;

export const identityAuthTemplateServiceFactory = ({
  identityAuthTemplateDAL,
  identityLdapAuthDAL,
  permissionService,
  kmsService,
  licenseService
}: TIdentityAuthTemplateServiceFactoryDep) => {
  // Plan check
  const $checkPlan = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.machineIdentityAuthTemplates)
      throw new BadRequestError({
        message:
          "Failed to use identity auth template due to plan restriction. Upgrade plan to access machine identity auth templates."
      });
  };
  const createTemplate = async ({
    name,
    authMethod,
    templateFields,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: {
    name: string;
    authMethod: string;
    templateFields: Record<string, unknown>;
  } & Omit<TOrgPermission, "orgId">) => {
    await $checkPlan(actorOrgId);
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });
    const template = await identityAuthTemplateDAL.create({
      name,
      authMethod,
      templateFields: encryptor({ plainText: Buffer.from(JSON.stringify(templateFields)) }).cipherTextBlob,
      orgId: actorOrgId
    });

    return template;
  };

  const updateTemplate = async ({
    templateId,
    name,
    templateFields,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: {
    templateId: string;
    name?: string;
    templateFields?: Record<string, unknown>;
  } & Omit<TOrgPermission, "orgId">) => {
    await $checkPlan(actorOrgId);
    const template = await identityAuthTemplateDAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      template.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: template.orgId
    });

    const updatedTemplate = await identityAuthTemplateDAL.transaction(async (tx) => {
      const authTemplate = await identityAuthTemplateDAL.updateById(
        templateId,
        {
          name,
          ...(templateFields && {
            templateFields: encryptor({ plainText: Buffer.from(JSON.stringify(templateFields)) }).cipherTextBlob
          })
        },
        tx
      );

      if (templateFields && template.authMethod === IdentityAuthTemplateMethod.LDAP) {
        const { decryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.Organization,
          orgId: template.orgId
        });

        const currentTemplateFields = JSON.parse(
          decryptor({ cipherTextBlob: template.templateFields }).toString()
        ) as TLdapTemplateFields;

        const mergedTemplateFields: TLdapTemplateFields = { ...currentTemplateFields, ...templateFields };

        const ldapUpdateData: {
          url?: string;
          searchBase?: string;
          encryptedBindDN?: Buffer;
          encryptedBindPass?: Buffer;
        } = {};

        if ("url" in templateFields) {
          ldapUpdateData.url = mergedTemplateFields.url;
        }
        if ("searchBase" in templateFields) {
          ldapUpdateData.searchBase = mergedTemplateFields.searchBase;
        }
        if ("bindDN" in templateFields) {
          ldapUpdateData.encryptedBindDN = encryptor({
            plainText: Buffer.from(mergedTemplateFields.bindDN)
          }).cipherTextBlob;
        }
        if ("bindPass" in templateFields) {
          ldapUpdateData.encryptedBindPass = encryptor({
            plainText: Buffer.from(mergedTemplateFields.bindPass)
          }).cipherTextBlob;
        }

        if (Object.keys(ldapUpdateData).length > 0) {
          await identityLdapAuthDAL.update({ templateId }, ldapUpdateData, tx);
        }
      }

      return authTemplate;
    });

    return updatedTemplate;
  };

  const deleteTemplate = async ({
    templateId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TDeleteIdentityAuthTemplateDTO) => {
    await $checkPlan(actorOrgId);
    const template = await identityAuthTemplateDAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      template.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const deletedTemplate = await identityAuthTemplateDAL.transaction(async (tx) => {
      // Remove template reference from identityLdapAuth records
      await identityLdapAuthDAL.update({ templateId }, { templateId: null }, tx);

      // Delete the template
      const [deletedTpl] = await identityAuthTemplateDAL.delete({ id: templateId }, tx);
      return deletedTpl;
    });

    return deletedTemplate;
  };

  const getTemplate = async ({
    templateId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetIdentityAuthTemplateDTO) => {
    await $checkPlan(actorOrgId);
    const template = await identityAuthTemplateDAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      template.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: template.orgId
    });
    const decryptedTemplateFields = decryptor({ cipherTextBlob: template.templateFields }).toString();
    return {
      ...template,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      templateFields: JSON.parse(decryptedTemplateFields)
    };
  };

  const listTemplates = async ({
    limit,
    offset,
    search,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TListIdentityAuthTemplatesDTO) => {
    await $checkPlan(actorOrgId);
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const { docs, totalCount } = await identityAuthTemplateDAL.findByOrgId(actorOrgId, { limit, offset, search });

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });
    return {
      totalCount,
      templates: docs.map((doc) => ({
        ...doc,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        templateFields: JSON.parse(decryptor({ cipherTextBlob: doc.templateFields }).toString())
      }))
    };
  };

  const getTemplatesByAuthMethod = async ({
    authMethod,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetTemplatesByAuthMethodDTO) => {
    await $checkPlan(actorOrgId);
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const docs = await identityAuthTemplateDAL.findByAuthMethod(authMethod, actorOrgId);

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });
    return docs.map((doc) => ({
      ...doc,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      templateFields: JSON.parse(decryptor({ cipherTextBlob: doc.templateFields }).toString())
    }));
  };

  const findTemplateUsages = async ({
    templateId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TFindTemplateUsagesDTO) => {
    await $checkPlan(actorOrgId);
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const template = await identityAuthTemplateDAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const docs = await identityAuthTemplateDAL.findTemplateUsages(templateId, template.authMethod);
    return docs;
  };

  const unlinkTemplateUsage = async ({
    templateId,
    identityIds,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUnlinkTemplateUsageDTO) => {
    await $checkPlan(actorOrgId);
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const template = await identityAuthTemplateDAL.findById(templateId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    switch (template.authMethod) {
      case IdentityAuthTemplateMethod.LDAP:
        await identityLdapAuthDAL.update({ $in: { identityId: identityIds }, templateId }, { templateId: null });
        break;
      default:
        break;
    }
  };

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    listTemplates,
    getTemplatesByAuthMethod,
    findTemplateUsages,
    unlinkTemplateUsage
  };
};
