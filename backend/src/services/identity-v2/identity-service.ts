import { AccessScope, OrgMembershipRole } from "@app/db/schemas/models";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { getIdentityActiveLockoutAuthMethods } from "@app/services/identity-v2/identity-fns";

import { TIdentityMetadataDALFactory } from "../identity/identity-metadata-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TIdentityV2DALFactory } from "./identity-dal";
import {
  TCreateIdentityV2DTO,
  TDeleteIdentityV2DTO,
  TGetIdentityByIdV2DTO,
  TListIdentityV2DTO,
  TUpdateIdentityV2DTO
} from "./identity-types";
import { newOrgIdentityFactory } from "./org/org-identity-factory";
import { newProjectIdentityFactory } from "./project/project-identity-factory";

type TScopedIdentityV2ServiceFactoryDep = {
  identityDAL: TIdentityV2DALFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  identityMetadataDAL: TIdentityMetadataDALFactory;
  keyStore: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem">;
};

export type TScopedIdentityV2ServiceFactory = ReturnType<typeof identityV2ServiceFactory>;

export const identityV2ServiceFactory = ({
  identityDAL,
  permissionService,
  licenseService,
  membershipIdentityDAL,
  membershipRoleDAL,
  identityMetadataDAL,
  keyStore
}: TScopedIdentityV2ServiceFactoryDep) => {
  const orgFactory = newOrgIdentityFactory({
    permissionService
  });
  const projectFactory = newProjectIdentityFactory({
    permissionService
  });

  const scopeFactory = {
    [AccessScope.Organization]: orgFactory,
    [AccessScope.Project]: projectFactory,
    // namespace will get stripped off
    [AccessScope.Namespace]: orgFactory
  };

  const createIdentity = async (dto: TCreateIdentityV2DTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onCreateIdentityGuard(dto);

    const plan = await licenseService.getPlan(dto.permission.orgId);

    if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        message: "Failed to create identity due to identity limit reached. Upgrade plan to create more identities."
      });
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create(
        {
          name: data.name,
          hasDeleteProtection: data.hasDeleteProtection,
          orgId: dto.permission.orgId,
          projectId: scopeData.scope === AccessScope.Project ? scopeData.projectId : null
        },
        tx
      );
      const orgMembership = await membershipIdentityDAL.create(
        {
          scope: AccessScope.Organization,
          actorIdentityId: newIdentity.id,
          scopeOrgId: dto.permission.orgId
        },
        tx
      );

      const newMembershipIds = [orgMembership.id];
      if (scopeData.scope === AccessScope.Project) {
        const projectMembership = await membershipIdentityDAL.create(
          {
            scope: AccessScope.Project,
            actorIdentityId: newIdentity.id,
            scopeOrgId: dto.permission.orgId,
            scopeProjectId: scopeData.projectId
          },
          tx
        );
        newMembershipIds.push(projectMembership.id);
      }

      await membershipRoleDAL.insertMany(
        newMembershipIds.map((membershipId) => ({
          membershipId,
          role: OrgMembershipRole.NoAccess
        })),
        tx
      );

      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (data.metadata && data.metadata.length) {
        const rowsToInsert = data.metadata.map(({ key, value }) => ({
          identityId: newIdentity.id,
          orgId: newIdentity.orgId,
          key,
          value
        }));

        insertedMetadata = await identityMetadataDAL.insertMany(rowsToInsert, tx);
      }

      return {
        ...newIdentity,
        authMethods: [],
        metadata: insertedMetadata
      };
    });
    await licenseService.updateSubscriptionOrgMemberCount(dto.permission.orgId);

    return { identity };
  };

  const updateIdentity = async (dto: TUpdateIdentityV2DTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onUpdateIdentityGuard(dto);
    const existingIdentity = await identityDAL.findOne({
      id: dto.selector.identityId,
      orgId: dto.permission.orgId,
      projectId: dto.scopeData.scope === AccessScope.Project ? dto.scopeData.projectId : null
    });
    if (!existingIdentity)
      throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    const identity = await identityDAL.transaction(async (tx) => {
      const updatedIdentity =
        data?.name || data?.hasDeleteProtection
          ? await identityDAL.updateById(
              dto.selector.identityId,
              { name: data.name, hasDeleteProtection: data.hasDeleteProtection },
              tx
            )
          : existingIdentity;

      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (data.metadata) {
        await identityMetadataDAL.delete({ orgId: dto.permission.orgId, identityId: dto.selector.identityId }, tx);

        if (data.metadata.length) {
          const rowsToInsert = data.metadata.map(({ key, value }) => ({
            identityId: updatedIdentity.id,
            orgId: updatedIdentity.orgId,
            key,
            value
          }));

          insertedMetadata = await identityMetadataDAL.insertMany(rowsToInsert, tx);
        }
      }

      return {
        ...updatedIdentity,
        metadata: insertedMetadata
      };
    });

    return { identity };
  };

  const deleteIdentity = async (dto: TDeleteIdentityV2DTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onDeleteIdentityGuard(dto);

    const existingIdentity = await identityDAL.findOne({
      id: dto.selector.identityId,
      orgId: dto.permission.orgId,
      projectId: dto.scopeData.scope === AccessScope.Project ? dto.scopeData.projectId : null
    });
    if (!existingIdentity)
      throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    const deletedIdentity = await identityDAL.deleteById(dto.selector.identityId);

    await licenseService.updateSubscriptionOrgMemberCount(scopeData.orgId);

    return { identity: deletedIdentity };
  };

  const getIdentityById = async (dto: TGetIdentityByIdV2DTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetIdentityByIdGuard(dto);

    const identity = await identityDAL.getIdentityById(dto.scopeData, dto.selector.identityId);
    if (!identity) throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    const activeLockoutAuthMethods = await getIdentityActiveLockoutAuthMethods(identity.id, keyStore);

    return { identity: { ...identity, activeLockoutAuthMethods } };
  };

  const listIdentities = async (dto: TListIdentityV2DTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    const isIdentityAccessible = await factory.onListIdentityGuard(dto);

    const identities = await identityDAL.listIdentities(dto.scopeData, {
      search: dto.data.search,
      offset: dto.data.offset,
      limit: dto.data.limit
    });

    return { ...identities, docs: identities.docs.filter((el) => isIdentityAccessible({ identityId: el.id })) };
  };

  return {
    createIdentity,
    updateIdentity,
    deleteIdentity,
    getIdentityById,
    listIdentities
  };
};
