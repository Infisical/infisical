import type { TActorContext } from "@app/domains/lib/actor-context";
import { TExternalKmsDetails, TExternalKmsService, TKmsKeyService } from "@app/domains/platform/kms-core/ce/module";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

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
  orgPermissionService: TOrgPermissionService;
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
  orgPermissionService,
  licenseService,
  kmsKeyService,
  externalKmsService
}: TExternalKmsServiceFactoryDep) => {
  const $orgPermission = (actor: TActorContext, orgId: string) =>
    orgPermissionService.getOrgPermission({ actor, orgId });

  const $requireExternalKey = async (kmsId: string) => {
    const key = await kmsKeyService.findKeyById(kmsId);
    if (!key?.isExternal) throw new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });
    return key;
  };

  const create = async ({ provider, description, actor, name }: TCreateExternalKmsDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Create, subject: OrgPermissionSubjects.Kms });

    const plan = await licenseService.getPlan(actor.org.id);
    if (!plan.has(PlanFeature.ExternalKms)) {
      throw new BadRequestError({
        message: "Failed to create external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return typed(await externalKmsService.create({ orgId: actor.org.id, name, description, provider }));
  };

  const updateById = async ({ provider, description, actor, id: kmsId, name }: TUpdateExternalKmsDTO) => {
    const key = await $requireExternalKey(kmsId);
    const permission = await $orgPermission(actor, key.orgId);
    permission.assert({ action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Kms });

    const plan = await licenseService.getPlan(key.orgId);
    if (!plan.has(PlanFeature.ExternalKms)) {
      throw new BadRequestError({
        message: "Failed to update external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return typed(await externalKmsService.update(kmsId, { name, description, provider }));
  };

  const deleteById = async ({ actor, id: kmsId }: TDeleteExternalKmsDTO) => {
    const key = await $requireExternalKey(kmsId);
    const permission = await $orgPermission(actor, key.orgId);
    permission.assert({ action: OrgPermissionActions.Delete, subject: OrgPermissionSubjects.Kms });

    return typed(await externalKmsService.delete(kmsId));
  };

  const list = async ({ actor }: TListExternalKmsDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    return externalKmsService.list(actor.org.id);
  };

  const findById = async ({ actor, id: kmsId }: TGetExternalKmsByIdDTO) => {
    const key = await kmsKeyService.findKeyById(kmsId);
    if (!key) throw new NotFoundError({ message: `Could not find KMS with ID '${kmsId}'` });
    const permission = await $orgPermission(actor, key.orgId);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    return typed(await externalKmsService.getById(kmsId));
  };

  const findByName = async ({ actor, name }: TGetExternalKmsBySlugDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    return typed(await externalKmsService.getByName(actor.org.id, name));
  };

  const fetchGcpKeys = async ({ credential, gcpRegion, actor }: TFetchGcpKmsKeysDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    const plan = await licenseService.getPlan(actor.org.id);
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
