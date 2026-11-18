import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { TExternalKmsDetails, TExternalKmsService, TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  TCreateExternalKmsDTO,
  TDeleteExternalKmsDTO,
  TFetchGcpKmsKeysDTO,
  TGetExternalKmsByIdDTO,
  TGetExternalKmsBySlugDTO,
  TListExternalKmsDTO,
  TUpdateExternalKmsDTO
} from "./external-kms-types";
import { TExternalKmsAwsSchema, TExternalKmsGcpSchema } from "./providers/model";

type TExternalKmsServiceFactoryDep = {
  kmsKeyService: TKmsKeyService;
  externalKmsService: TExternalKmsService;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: TLicenseService;
};

export type TExternalKmsServiceFactory = ReturnType<typeof externalKmsServiceFactory>;

// Types the provider input KMS Core returns, for the routes that sanitize it.
const typed = (details: TExternalKmsDetails) => ({
  ...details,
  external: {
    ...details.external,
    providerInput: details.external.providerInput as unknown as TExternalKmsAwsSchema | TExternalKmsGcpSchema
  }
});

// Only checks org permissions and the externalKms plan. KMS Core's enterprise edition stores keys and calls providers.
// Creating, changing or browsing provider keys needs the plan; reading or deleting an existing key doesn't.
export const externalKmsServiceFactory = ({
  permissionService,
  licenseService,
  kmsKeyService,
  externalKmsService
}: TExternalKmsServiceFactoryDep) => {
  const $orgPermission = (
    actor: TCreateExternalKmsDTO["actor"],
    actorId: string,
    orgId: string,
    actorAuthMethod: TCreateExternalKmsDTO["actorAuthMethod"],
    actorOrgId: string
  ) =>
    permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });

  const $requireExternalKey = async (kmsId: string) => {
    const key = await kmsKeyService.findKeyById(kmsId);
    if (!key?.isExternal) throw new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });
    return key;
  };

  const create = async ({
    provider,
    description,
    actor,
    name,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TCreateExternalKmsDTO) => {
    const { permission } = await $orgPermission(actor, actorId, actorOrgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Kms);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.has(PlanFeature.ExternalKms)) {
      throw new BadRequestError({
        message: "Failed to create external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return typed(await externalKmsService.create({ orgId: actorOrgId, name, description, provider }));
  };

  const updateById = async ({
    provider,
    description,
    actor,
    id: kmsId,
    name,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TUpdateExternalKmsDTO) => {
    const key = await $requireExternalKey(kmsId);
    const { permission } = await $orgPermission(actor, actorId, key.orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Kms);

    const plan = await licenseService.getPlan(key.orgId);
    if (!plan.has(PlanFeature.ExternalKms)) {
      throw new BadRequestError({
        message: "Failed to update external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return typed(await externalKmsService.update(kmsId, { name, description, provider }));
  };

  const deleteById = async ({ actor, id: kmsId, actorId, actorOrgId, actorAuthMethod }: TDeleteExternalKmsDTO) => {
    const key = await $requireExternalKey(kmsId);
    const { permission } = await $orgPermission(actor, actorId, key.orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Kms);

    return typed(await externalKmsService.delete(kmsId));
  };

  const list = async ({ actor, actorId, actorOrgId, actorAuthMethod }: TListExternalKmsDTO) => {
    const { permission } = await $orgPermission(actor, actorId, actorOrgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    return externalKmsService.list(actorOrgId);
  };

  const findById = async ({ actor, actorId, actorOrgId, actorAuthMethod, id: kmsId }: TGetExternalKmsByIdDTO) => {
    const key = await kmsKeyService.findKeyById(kmsId);
    if (!key) throw new NotFoundError({ message: `Could not find KMS with ID '${kmsId}'` });
    const { permission } = await $orgPermission(actor, actorId, key.orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    return typed(await externalKmsService.getById(kmsId));
  };

  const findByName = async ({ actor, actorId, actorOrgId, actorAuthMethod, name }: TGetExternalKmsBySlugDTO) => {
    const { permission } = await $orgPermission(actor, actorId, actorOrgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    return typed(await externalKmsService.getByName(actorOrgId, name));
  };

  const fetchGcpKeys = async ({
    credential,
    gcpRegion,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TFetchGcpKmsKeysDTO) => {
    const { permission } = await $orgPermission(actor, actorId, actorOrgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.has(PlanFeature.ExternalKms)) {
      throw new BadRequestError({
        message: "Failed to fetch GCP KMS keys due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return externalKmsService.fetchGcpKeys({ credential, gcpRegion });
  };

  return {
    create,
    updateById,
    deleteById,
    list,
    findById,
    findByName,
    fetchGcpKeys
  };
};
