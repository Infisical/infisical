import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, TIdentityKubernetesAuthsUpdate } from "@app/db/schemas";
import { TIdentityAuthTemplates } from "@app/db/schemas/identity-auth-templates";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { TGatewayPoolDALFactory } from "@app/ee/services/gateway-pool/gateway-pool-dal";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionGatewayActions,
  OrgPermissionGatewayPoolActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { TOrgPermission } from "@app/lib/types";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityKubernetesAuthDALFactory } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-dal";
import { IdentityKubernetesAuthTokenReviewMode } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";
import { validateKubernetesConnectionFields } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-validators";
import { TIdentityLdapAuthDALFactory } from "@app/services/identity-ldap-auth/identity-ldap-auth-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TIdentityAuthTemplateDALFactory } from "./identity-auth-template-dal";
import { IdentityAuthTemplateMethod, TEMPLATE_SECRET_FIELDS_BY_METHOD } from "./identity-auth-template-enums";
import { templateFieldPatchKeysByMethod } from "./identity-auth-template-schemas";
import {
  TDeleteIdentityAuthTemplateDTO,
  TFindTemplateUsagesDTO,
  TGetIdentityAuthTemplateDTO,
  TGetTemplatesByAuthMethodDTO,
  TKubernetesTemplateFields,
  TLdapTemplateFields,
  TListIdentityAuthTemplatesDTO,
  TSanitizedIdentityAuthTemplate,
  TUnlinkTemplateUsageDTO
} from "./identity-auth-template-types";

type TIdentityAuthTemplateServiceFactoryDep = {
  identityAuthTemplateDAL: TIdentityAuthTemplateDALFactory;
  identityLdapAuthDAL: Pick<TIdentityLdapAuthDALFactory, "updateByTemplateId">;
  identityKubernetesAuthDAL: Pick<TIdentityKubernetesAuthDALFactory, "updateByTemplateId">;
  gatewayDAL: Pick<TGatewayDALFactory, "find">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "find">;
  gatewayPoolDAL: Pick<TGatewayPoolDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "encryptWithInputKey" | "decryptWithInputKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TIdentityAuthTemplateServiceFactory = ReturnType<typeof identityAuthTemplateServiceFactory>;

const AUDIT_FANOUT_CHUNK_SIZE = 20;

export const identityAuthTemplateServiceFactory = ({
  identityAuthTemplateDAL,
  identityLdapAuthDAL,
  identityKubernetesAuthDAL,
  gatewayDAL,
  gatewayV2DAL,
  gatewayPoolDAL,
  permissionService,
  kmsService,
  licenseService,
  auditLogService
}: TIdentityAuthTemplateServiceFactoryDep) => {
  // Plan check
  const $checkPlan = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.machineIdentityAuthTemplates)
      throw new BadRequestError({
        message:
          "Failed to use identity auth template due to plan restriction. Upgrade plan to access machine identity auth templates."
      });
    return plan;
  };

  // template credentials are write-only: every read path strips them so they never
  // reach the client (the edit UI keeps a stored secret by omitting the field). A
  // has<Field> presence flag replaces each secret so the edit UI can offer an explicit
  // "clear stored value" action without ever reading the credential
  const $sanitizeTemplate = (
    template: TIdentityAuthTemplates,
    fields: Record<string, unknown>
  ): TSanitizedIdentityAuthTemplate => {
    const secretFields = TEMPLATE_SECRET_FIELDS_BY_METHOD[template.authMethod as IdentityAuthTemplateMethod] ?? [];
    const redacted = { ...fields };
    secretFields.forEach((key) => {
      const value = redacted[key];
      delete redacted[key];
      redacted[`has${key.charAt(0).toUpperCase()}${key.slice(1)}`] = typeof value === "string" && value.length > 0;
    });
    // authMethod is a plain string column; every row is written through the create route's
    // discriminated body, so it is always one of the supported methods here
    return { ...template, templateFields: redacted } as TSanitizedIdentityAuthTemplate;
  };

  // audit the platform-driven rewrite of linked identities; runs after the propagation
  // transaction commits so the tx never waits on Redis, chunked to bound concurrency
  const $auditTemplatePropagation = async ({
    identities,
    authMethod,
    templateId,
    templateName,
    orgId
  }: {
    identities: { identityId: string; identityName?: string }[];
    authMethod: string;
    templateId: string;
    templateName: string;
    orgId: string;
  }) => {
    for (const batch of chunkArray(identities, AUDIT_FANOUT_CHUNK_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        batch.map(({ identityId, identityName }) =>
          auditLogService.createAuditLog({
            actor: {
              type: ActorType.PLATFORM,
              metadata: {}
            },
            orgId,
            event:
              authMethod === IdentityAuthTemplateMethod.LDAP
                ? {
                    type: EventType.UPDATE_IDENTITY_LDAP_AUTH,
                    metadata: { identityId, identityName, templateId, templateName }
                  }
                : {
                    type: EventType.UPDATE_IDENTITY_KUBENETES_AUTH,
                    metadata: { identityId, identityName, templateId, templateName }
                  }
          })
        )
      );
    }
  };

  const $validateKubernetesTemplateFields = (fields: TKubernetesTemplateFields) => {
    const issues = validateKubernetesConnectionFields(fields);
    if (issues.length > 0) {
      throw new BadRequestError({ message: issues[0].message });
    }
  };

  // mirrors the checks the identity k8s auth attach flow runs, so a template cannot smuggle
  // in a gateway its author could not attach directly
  const $authorizeKubernetesTemplateGateway = ({
    gatewayId,
    gatewayPoolId,
    plan,
    permission
  }: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    plan: Awaited<ReturnType<TLicenseServiceFactory["getPlan"]>>;
    permission: Awaited<ReturnType<TPermissionServiceFactory["getOrgPermission"]>>["permission"];
  }) => {
    if (gatewayId) {
      if (!plan.gateway) {
        throw new BadRequestError({
          message:
            "Your current plan does not support gateway usage with identity k8s auth. Please upgrade your plan or contact Infisical Sales for assistance."
        });
      }
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );
    }
    if (gatewayPoolId) {
      if (!plan.gatewayPool) {
        throw new BadRequestError({
          message: "Your current plan does not support gateway pools. Please upgrade to an Enterprise plan."
        });
      }
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionGatewayPoolActions.AttachGatewayPools,
        OrgPermissionSubjects.GatewayPool
      );
    }
  };

  // resolves the template's user-facing gatewayId onto the v1/v2 column split used by
  // identity_kubernetes_auths; only called when the caller is setting a gateway, so a
  // stale reference inside the encrypted blob cannot block unrelated template edits
  const $resolveKubernetesTemplateGateway = async ({
    gatewayId,
    gatewayPoolId,
    orgId
  }: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    orgId: string;
  }) => {
    let resolvedGatewayId: string | null = null;
    let resolvedGatewayV2Id: string | null = null;
    if (gatewayId && !gatewayPoolId) {
      const [[gateway], [gatewayV2]] = await Promise.all([
        gatewayDAL.find({ id: gatewayId, orgId }),
        gatewayV2DAL.find({ id: gatewayId, orgId })
      ]);
      if (gateway) {
        resolvedGatewayId = gatewayId;
      } else if (gatewayV2) {
        resolvedGatewayV2Id = gatewayId;
      } else {
        throw new BadRequestError({
          message: `Gateway with ID '${gatewayId}' was not found in this organization. Select an existing gateway for the template.`
        });
      }
    }
    if (gatewayPoolId) {
      const pool = await gatewayPoolDAL.findById(gatewayPoolId);
      if (!pool || pool.orgId !== orgId) {
        throw new BadRequestError({
          message: `Gateway pool with ID '${gatewayPoolId}' was not found in this organization. Select an existing gateway pool for the template.`
        });
      }
    }
    return { resolvedGatewayId, resolvedGatewayV2Id, resolvedGatewayPoolId: gatewayPoolId ?? null };
  };

  // the gateway exemption on the host check is only sound while the reference still points at
  // a live gateway: identity_kubernetes_auths loses its gateway columns to ON DELETE SET NULL,
  // but the template keeps the id inside its encrypted blob, so a deleted gateway leaves the
  // two out of sync and the linked rows fall back to dialing the host directly
  const $kubernetesTemplateGatewayIsLive = async ({
    gatewayId,
    gatewayPoolId,
    orgId
  }: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    orgId: string;
  }) => {
    if (gatewayPoolId) {
      const pool = await gatewayPoolDAL.findById(gatewayPoolId);
      return Boolean(pool && pool.orgId === orgId);
    }
    if (gatewayId) {
      const [[gateway], [gatewayV2]] = await Promise.all([
        gatewayDAL.find({ id: gatewayId, orgId }),
        gatewayV2DAL.find({ id: gatewayId, orgId })
      ]);
      return Boolean(gateway || gatewayV2);
    }
    return false;
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
    const plan = await $checkPlan(actorOrgId);
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    let fieldsToPersist: Record<string, unknown> = templateFields;
    if (authMethod === IdentityAuthTemplateMethod.KUBERNETES) {
      const kubernetesFields = templateFields as TKubernetesTemplateFields;
      const normalizedFields: TKubernetesTemplateFields = {
        ...kubernetesFields,
        verifyTlsCertificate: kubernetesFields.verifyTlsCertificate ?? Boolean(kubernetesFields.caCert?.length)
      };
      $validateKubernetesTemplateFields(normalizedFields);
      // parity with the identity attach flow: a template-authored host must not let the
      // backend dial local or private addresses (a gateway-dialed host is exempt; private
      // hosts are the normal case behind a gateway)
      if (
        normalizedFields.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api &&
        normalizedFields.kubernetesHost &&
        !normalizedFields.gatewayId &&
        !normalizedFields.gatewayPoolId
      ) {
        await blockLocalAndPrivateIpAddresses(normalizedFields.kubernetesHost);
      }
      if (normalizedFields.gatewayId || normalizedFields.gatewayPoolId) {
        $authorizeKubernetesTemplateGateway({
          gatewayId: normalizedFields.gatewayId,
          gatewayPoolId: normalizedFields.gatewayPoolId,
          plan,
          permission
        });
        await $resolveKubernetesTemplateGateway({
          gatewayId: normalizedFields.gatewayId,
          gatewayPoolId: normalizedFields.gatewayPoolId,
          orgId: actorOrgId
        });
      }
      fieldsToPersist = normalizedFields;
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });
    const template = await identityAuthTemplateDAL.create({
      name,
      authMethod,
      templateFields: encryptor({ plainText: Buffer.from(JSON.stringify(fieldsToPersist)) }).cipherTextBlob,
      orgId: actorOrgId
    });

    return $sanitizeTemplate(template, fieldsToPersist);
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
    const plan = await $checkPlan(actorOrgId);
    const template = await identityAuthTemplateDAL.findByIdAndOrgId(templateId, actorOrgId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: template.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.EditTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: template.orgId
    });

    const fieldPatch = templateFields && Object.keys(templateFields).length > 0 ? templateFields : undefined;

    if (fieldPatch) {
      const allowedPatchKeys: readonly string[] =
        templateFieldPatchKeysByMethod[template.authMethod as IdentityAuthTemplateMethod] ?? [];
      const invalidKeys = Object.keys(fieldPatch).filter((key) => !allowedPatchKeys.includes(key));
      if (invalidKeys.length > 0) {
        throw new BadRequestError({
          message: `Template fields [${invalidKeys.join(", ")}] are not valid for a '${template.authMethod}' auth template`
        });
      }
    }

    // captured before the propagation writes so the audit entries can carry readable
    // identity names alongside the ids
    const linkedIdentities = fieldPatch
      ? ((await identityAuthTemplateDAL.findTemplateUsages(templateId, template.authMethod)) as {
          identityId: string;
          identityName: string;
        }[])
      : [];

    const currentTemplateFields = JSON.parse(
      decryptor({ cipherTextBlob: template.templateFields }).toString()
    ) as Record<string, unknown>;
    const mergedTemplateFields: Record<string, unknown> = fieldPatch
      ? { ...currentTemplateFields, ...fieldPatch }
      : currentTemplateFields;

    let kubernetesPropagationData: TIdentityKubernetesAuthsUpdate | undefined;
    if (fieldPatch && template.authMethod === IdentityAuthTemplateMethod.KUBERNETES) {
      const merged = mergedTemplateFields as TKubernetesTemplateFields;
      const patch = fieldPatch as Partial<TKubernetesTemplateFields>;
      // follow the CA cert with the verification toggle unless the patch sets it explicitly,
      // mirroring the identity k8s auth update behavior
      if (!("verifyTlsCertificate" in patch) && "caCert" in patch) {
        merged.verifyTlsCertificate = Boolean(patch.caCert?.length);
      }
      $validateKubernetesTemplateFields(merged);
      // gateway references are re-resolved (and re-authorized) only when the patch touches
      // them; linked rows keep their columns otherwise, so a gateway that was deleted after
      // authoring cannot block unrelated edits like rotating the reviewer JWT
      const patchTouchesGateway = "gatewayId" in patch || "gatewayPoolId" in patch;
      let resolvedGateway: Awaited<ReturnType<typeof $resolveKubernetesTemplateGateway>> | undefined;
      if (patchTouchesGateway) {
        $authorizeKubernetesTemplateGateway({
          gatewayId: merged.gatewayId,
          gatewayPoolId: merged.gatewayPoolId,
          plan,
          permission
        });
        resolvedGateway = await $resolveKubernetesTemplateGateway({
          gatewayId: merged.gatewayId,
          gatewayPoolId: merged.gatewayPoolId,
          orgId: template.orgId
        });
      }
      // the merged host propagates to every linked identity and is dialed by the backend at
      // login, so it gets the same local/private-address block as the identity attach flow.
      // only patches that change where we dial are checked: re-checking on every edit would
      // strand a template whose gateway was deleted, since its host is legitimately private.
      // gateway-dialed hosts stay exempt, but only while the reference still resolves, as the
      // linked rows have already lost the gateway a stale id in the blob still claims
      const patchAffectsDialing = patchTouchesGateway || "kubernetesHost" in patch || "tokenReviewMode" in patch;
      if (
        patchAffectsDialing &&
        merged.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api &&
        merged.kubernetesHost
      ) {
        const dialsThroughGateway = resolvedGateway
          ? Boolean(
              resolvedGateway.resolvedGatewayId ||
                resolvedGateway.resolvedGatewayV2Id ||
                resolvedGateway.resolvedGatewayPoolId
            )
          : await $kubernetesTemplateGatewayIsLive({
              gatewayId: merged.gatewayId,
              gatewayPoolId: merged.gatewayPoolId,
              orgId: template.orgId
            });
        if (!dialsThroughGateway) {
          await blockLocalAndPrivateIpAddresses(merged.kubernetesHost);
        }
      }
      kubernetesPropagationData = {
        kubernetesHost: merged.kubernetesHost ?? null,
        tokenReviewMode: merged.tokenReviewMode,
        allowedAudience: merged.allowedAudience ?? "",
        verifyTlsCertificate: merged.verifyTlsCertificate ?? Boolean(merged.caCert?.length),
        encryptedKubernetesCaCertificate: merged.caCert
          ? encryptor({ plainText: Buffer.from(merged.caCert) }).cipherTextBlob
          : null,
        encryptedKubernetesTokenReviewerJwt: merged.tokenReviewerJwt
          ? encryptor({ plainText: Buffer.from(merged.tokenReviewerJwt) }).cipherTextBlob
          : null,
        isTokenReviewerJwtTemplateSourced: Boolean(merged.tokenReviewerJwt)
      };
      if (resolvedGateway) {
        kubernetesPropagationData.gatewayId = resolvedGateway.resolvedGatewayId;
        kubernetesPropagationData.gatewayV2Id = resolvedGateway.resolvedGatewayV2Id;
        kubernetesPropagationData.gatewayPoolId = resolvedGateway.resolvedGatewayPoolId;
      }
    }

    const { updatedTemplate, propagatedIdentityIds } = await identityAuthTemplateDAL.transaction(async (tx) => {
      const authTemplate = await identityAuthTemplateDAL.updateById(
        templateId,
        {
          name,
          ...(fieldPatch && {
            // persist the merged result, not the raw patch, so a partial update cannot
            // destroy the fields it does not carry
            templateFields: encryptor({ plainText: Buffer.from(JSON.stringify(mergedTemplateFields)) }).cipherTextBlob
          })
        },
        tx
      );

      let identityIds: string[] = [];

      if (fieldPatch && template.authMethod === IdentityAuthTemplateMethod.LDAP) {
        const mergedLdapFields = mergedTemplateFields as TLdapTemplateFields;
        const ldapUpdateData: {
          url?: string;
          searchBase?: string;
          encryptedBindDN?: Buffer;
          encryptedBindPass?: Buffer;
          encryptedLdapCaCertificate?: Buffer;
        } = {};

        if ("url" in fieldPatch) {
          ldapUpdateData.url = mergedLdapFields.url;
        }
        if ("searchBase" in fieldPatch) {
          ldapUpdateData.searchBase = mergedLdapFields.searchBase;
        }
        if ("bindDN" in fieldPatch) {
          ldapUpdateData.encryptedBindDN = encryptor({
            plainText: Buffer.from(mergedLdapFields.bindDN)
          }).cipherTextBlob;
        }
        if ("bindPass" in fieldPatch) {
          ldapUpdateData.encryptedBindPass = encryptor({
            plainText: Buffer.from(mergedLdapFields.bindPass)
          }).cipherTextBlob;
        }
        if ("ldapCaCertificate" in fieldPatch) {
          ldapUpdateData.encryptedLdapCaCertificate = encryptor({
            plainText: Buffer.from(mergedLdapFields.ldapCaCertificate || "")
          }).cipherTextBlob;
        }

        if (Object.keys(ldapUpdateData).length > 0) {
          const updatedRows = await identityLdapAuthDAL.updateByTemplateId({ templateId }, ldapUpdateData, tx);
          identityIds = updatedRows.map((row) => row.identityId);
        }
      }

      if (kubernetesPropagationData) {
        const updatedRows = await identityKubernetesAuthDAL.updateByTemplateId(
          { templateId },
          kubernetesPropagationData,
          tx
        );
        identityIds = updatedRows.map((row) => row.identityId);
      }

      return { updatedTemplate: authTemplate, propagatedIdentityIds: identityIds };
    });

    const identityNameById = new Map(linkedIdentities.map((usage) => [usage.identityId, usage.identityName]));
    await $auditTemplatePropagation({
      identities: propagatedIdentityIds.map((identityId) => ({
        identityId,
        identityName: identityNameById.get(identityId)
      })),
      authMethod: template.authMethod,
      templateId: template.id,
      templateName: template.name,
      orgId: template.orgId
    });

    return $sanitizeTemplate(updatedTemplate, mergedTemplateFields);
  };

  const deleteTemplate = async ({
    templateId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TDeleteIdentityAuthTemplateDTO) => {
    await $checkPlan(actorOrgId);
    const template = await identityAuthTemplateDAL.findByIdAndOrgId(templateId, actorOrgId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: template.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.DeleteTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const linkedIdentities = (await identityAuthTemplateDAL.findTemplateUsages(templateId, template.authMethod)) as {
      identityId: string;
      identityName: string;
    }[];

    const { deletedTemplate, unlinkedIdentityIds } = await identityAuthTemplateDAL.transaction(async (tx) => {
      // Unlink identity auth records; the copied config values are kept so linked
      // identities keep authenticating
      let identityIds: string[] = [];
      if (template.authMethod === IdentityAuthTemplateMethod.LDAP) {
        const updatedRows = await identityLdapAuthDAL.updateByTemplateId({ templateId }, { templateId: null }, tx);
        identityIds = updatedRows.map((row) => row.identityId);
      } else if (template.authMethod === IdentityAuthTemplateMethod.KUBERNETES) {
        const updatedRows = await identityKubernetesAuthDAL.updateByTemplateId(
          { templateId },
          { templateId: null },
          tx
        );
        identityIds = updatedRows.map((row) => row.identityId);
      } else {
        // fail loudly rather than deleting a template whose linked identities we cannot unlink
        throw new BadRequestError({
          message: `Deleting templates with auth method '${template.authMethod}' is not supported`
        });
      }

      const [deletedTpl] = await identityAuthTemplateDAL.delete({ id: templateId }, tx);
      return { deletedTemplate: deletedTpl, unlinkedIdentityIds: identityIds };
    });

    const identityNameById = new Map(linkedIdentities.map((usage) => [usage.identityId, usage.identityName]));
    await $auditTemplatePropagation({
      identities: unlinkedIdentityIds.map((identityId) => ({
        identityId,
        identityName: identityNameById.get(identityId)
      })),
      authMethod: template.authMethod,
      templateId: template.id,
      templateName: template.name,
      orgId: template.orgId
    });

    return { ...deletedTemplate, templateFields: {} };
  };

  const getTemplate = async ({
    templateId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetIdentityAuthTemplateDTO) => {
    await $checkPlan(actorOrgId);
    const template = await identityAuthTemplateDAL.findByIdAndOrgId(templateId, actorOrgId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: template.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: template.orgId
    });
    const decryptedTemplateFields = JSON.parse(
      decryptor({ cipherTextBlob: template.templateFields }).toString()
    ) as Record<string, unknown>;
    return $sanitizeTemplate(template, decryptedTemplateFields);
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
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
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
      templates: docs.map((doc) => {
        const parsedTemplateFields = JSON.parse(decryptor({ cipherTextBlob: doc.templateFields }).toString()) as Record<
          string,
          unknown
        >;
        return $sanitizeTemplate(doc, parsedTemplateFields);
      })
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
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const docs = await identityAuthTemplateDAL.findByAuthMethod(authMethod, actorOrgId);

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });
    return docs.map((doc) => {
      const parsedTemplateFields = JSON.parse(decryptor({ cipherTextBlob: doc.templateFields }).toString()) as Record<
        string,
        unknown
      >;
      return $sanitizeTemplate(doc, parsedTemplateFields);
    });
  };

  const findTemplateUsages = async ({
    templateId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TFindTemplateUsagesDTO) => {
    await $checkPlan(actorOrgId);
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const template = await identityAuthTemplateDAL.findByIdAndOrgId(templateId, actorOrgId);
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
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionMachineIdentityAuthTemplateActions.UnlinkTemplates,
      OrgPermissionSubjects.MachineIdentityAuthTemplate
    );

    const template = await identityAuthTemplateDAL.findByIdAndOrgId(templateId, actorOrgId);
    if (!template) {
      throw new NotFoundError({ message: "Template not found" });
    }

    const linkedIdentities = (await identityAuthTemplateDAL.findTemplateUsages(templateId, template.authMethod)) as {
      identityId: string;
      identityName: string;
    }[];

    let unlinkedIdentityIds: string[] = [];
    if (template.authMethod === IdentityAuthTemplateMethod.LDAP) {
      const updatedRows = await identityLdapAuthDAL.updateByTemplateId(
        { templateId, identityIds },
        { templateId: null }
      );
      unlinkedIdentityIds = updatedRows.map((row) => row.identityId);
    } else if (template.authMethod === IdentityAuthTemplateMethod.KUBERNETES) {
      const updatedRows = await identityKubernetesAuthDAL.updateByTemplateId(
        { templateId, identityIds },
        { templateId: null }
      );
      unlinkedIdentityIds = updatedRows.map((row) => row.identityId);
    } else {
      throw new BadRequestError({
        message: `Unlinking templates with auth method '${template.authMethod}' is not supported`
      });
    }

    const identityNameById = new Map(linkedIdentities.map((usage) => [usage.identityId, usage.identityName]));
    await $auditTemplatePropagation({
      identities: unlinkedIdentityIds.map((identityId) => ({
        identityId,
        identityName: identityNameById.get(identityId)
      })),
      authMethod: template.authMethod,
      templateId: template.id,
      templateName: template.name,
      orgId: template.orgId
    });
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
