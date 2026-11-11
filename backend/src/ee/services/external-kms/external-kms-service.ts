import type { TActorContext } from "@app/domains/lib/actor-context";
import { TExternalKmsDetails, TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseDomain } from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
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
  kmsCoreDomain: TKmsCoreDomain;
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  licenseDomain: TLicenseDomain;
};

export type TExternalKmsServiceFactory = ReturnType<typeof externalKmsServiceFactory>;

// The provider inputs KMS Core returns, typed for the routes that sanitize them.
const typed = (details: TExternalKmsDetails) => ({
  ...details,
  external: {
    ...details.external,
    providerInput: details.external.providerInput as unknown as TExternalKmsAwsSchema | TExternalKmsGcpSchema
  }
});

// Org permissions and the externalKms plan for external KMS keys; KMS Core stores them and talks to the providers.
// Creating, changing or browsing provider keys needs the plan; reading or deleting an existing key does not.
export const externalKmsServiceFactory = ({
  organizationsDomain,
  licenseDomain,
  kmsCoreDomain
}: TExternalKmsServiceFactoryDep) => {
  const $orgPermission = (actor: TActorContext, orgId: string) =>
    organizationsDomain.getOrgPermission({ actor, orgId });

  const $requireExternalKey = async (kmsId: string) => {
    const key = await kmsCoreDomain.findKeyById(kmsId);
    if (!key?.isExternal) throw new NotFoundError({ message: `External KMS with ID '${kmsId}' not found` });
    return key;
  };

  const create = async ({ provider, description, actor, name }: TCreateExternalKmsDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Create, subject: OrgPermissionSubjects.Kms });

    const plan = await licenseDomain.getPlan(actor.org.id);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to create external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return typed(await kmsCoreDomain.createExternalKms({ orgId: actor.org.id, name, description, provider }));
  };

  const updateById = async ({ provider, description, actor, id: kmsId, name }: TUpdateExternalKmsDTO) => {
    const key = await $requireExternalKey(kmsId);
    const permission = await $orgPermission(actor, key.orgId);
    permission.assert({ action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Kms });

    const plan = await licenseDomain.getPlan(key.orgId);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to update external KMS due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return typed(await kmsCoreDomain.updateExternalKms({ kmsId, name, description, provider }));
  };

  const deleteById = async ({ actor, id: kmsId }: TDeleteExternalKmsDTO) => {
    const key = await $requireExternalKey(kmsId);
    const permission = await $orgPermission(actor, key.orgId);
    permission.assert({ action: OrgPermissionActions.Delete, subject: OrgPermissionSubjects.Kms });

    return typed(await kmsCoreDomain.deleteExternalKms(kmsId));
  };

  const list = async ({ actor }: TListExternalKmsDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    return kmsCoreDomain.listExternalKms(actor.org.id);
  };

  const findById = async ({ actor, id: kmsId }: TGetExternalKmsByIdDTO) => {
    const key = await kmsCoreDomain.findKeyById(kmsId);
    if (!key) throw new NotFoundError({ message: `Could not find KMS with ID '${kmsId}'` });
    const permission = await $orgPermission(actor, key.orgId);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    return typed(await kmsCoreDomain.getExternalKms(kmsId));
  };

  const findByName = async ({ actor, name }: TGetExternalKmsBySlugDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    return typed(await kmsCoreDomain.getExternalKmsByName(actor.org.id, name));
  };

  const fetchGcpKeys = async ({ credential, gcpRegion, actor }: TFetchGcpKmsKeysDTO) => {
    const permission = await $orgPermission(actor, actor.org.id);
    permission.assert({ action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Kms });

    const plan = await licenseDomain.getPlan(actor.org.id);
    if (!plan.externalKms) {
      throw new BadRequestError({
        message: "Failed to fetch GCP KMS keys due to plan restriction. Upgrade to the Enterprise plan."
      });
    }

    return kmsCoreDomain.fetchGcpKeys({ credential, gcpRegion });
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
