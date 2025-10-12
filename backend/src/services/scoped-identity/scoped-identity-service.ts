import { AccessScope, OrgMembershipRole } from "@app/db/schemas";
import { TScopedIdentityDALFactory } from "./scoped-identity-dal";
import {
  TCreateIdentityDTO,
  TDeleteIdentityDTO,
  TGetIdentityByIdDTO,
  TListIdentityDTO,
  TUpdateIdentityDTO
} from "./scoped-identity-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TIdentityMetadataDALFactory } from "../identity/identity-metadata-dal";
import { newOrgScopedIdentityFactory } from "./org/org-scoped-identity-factory";
import { newProjectScopedIdentityFactory } from "./project/project-scoped-identity-factory";
import { newNamespaceScopedIdentityFactory } from "./namespace/namespace-scoped-identity-factory";

type TScopedIdentityServiceFactoryDep = {
  identityDAL: TScopedIdentityDALFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  identityMetadataDAL: TIdentityMetadataDALFactory;
};

export type TScopedIdentityServiceFactory = ReturnType<typeof scopedIdentityServiceFactory>;

export const scopedIdentityServiceFactory = ({
  identityDAL,
  permissionService,
  licenseService,
  membershipIdentityDAL,
  membershipRoleDAL,
  projectDAL,
  identityMetadataDAL
}: TScopedIdentityServiceFactoryDep) => {
  const orgFactory = newOrgScopedIdentityFactory({
    permissionService
  });
  const projectFactory = newProjectScopedIdentityFactory({
    permissionService,
    membershipIdentityDAL,
    projectDAL
  });
  const namespaceFactory = newNamespaceScopedIdentityFactory({
    permissionService,
    licenseService,
    membershipIdentityDAL
  });
  const scopeFactory = {
    [AccessScope.Organization]: orgFactory,
    [AccessScope.Project]: projectFactory,
    [AccessScope.Namespace]: namespaceFactory
  };

  const createIdentity = async (dto: TCreateIdentityDTO) => {
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
        { name: data.name, hasDeleteProtection: data.hasDeleteProtection },
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

      const { membershipIds } = await factory.onCreateIdentityDBOperations(dto, newIdentity.id, tx);

      await membershipRoleDAL.insertMany(
        [orgMembership.id, ...membershipIds].map((membershipId) => ({
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
          orgId: dto.permission.orgId,
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

  const updateIdentity = async (dto: TUpdateIdentityDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onUpdateIdentityGuard(dto);
    const existingIdentity = await identityDAL.getIdentityById(dto.scopeData, dto.selector.identityId);
    if (!existingIdentity)
      throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity =
        data?.name || data?.hasDeleteProtection
          ? await identityDAL.updateById(
              dto.selector.identityId,
              { name: data.name, hasDeleteProtection: data.hasDeleteProtection },
              tx
            )
          : await identityDAL.findById(dto.selector.identityId, tx);

      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (data.metadata) {
        await identityMetadataDAL.delete({ orgId: dto.permission.orgId, identityId: dto.selector.identityId }, tx);

        if (data.metadata.length) {
          const rowsToInsert = data.metadata.map(({ key, value }) => ({
            identityId: newIdentity.id,
            orgId: dto.permission.orgId,
            key,
            value
          }));

          insertedMetadata = await identityMetadataDAL.insertMany(rowsToInsert, tx);
        }
      }

      return {
        ...newIdentity,
        metadata: insertedMetadata
      };
    });

    return { identity };
  };

  const deleteIdentity = async (dto: TDeleteIdentityDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onDeleteIdentityGuard(dto);
    const existingIdentity = await identityDAL.getIdentityById(dto.scopeData, dto.selector.identityId);
    if (!existingIdentity)
      throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    const deletedIdentity = await identityDAL.deleteById(dto.selector.identityId);

    await licenseService.updateSubscriptionOrgMemberCount(scopeData.orgId);

    return { identity: deletedIdentity };
  };

  const getIdentityById = async (dto: TGetIdentityByIdDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetIdentityByIdGuard(dto);

    const identity = await identityDAL.getIdentityById(dto.scopeData, dto.selector.identityId);
    if (!identity) throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    return { identity };
  };

  const listIdentities = async (dto: TListIdentityDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListIdentityGuard(dto);

    const identities = await identityDAL.listIdentities(dto.scopeData, {
      search: dto.data.search,
      offset: dto.data.offset,
      limit: dto.data.limit
    });

    return { identities };
  };

  return {
    createIdentity,
    updateIdentity,
    deleteIdentity,
    getIdentityById,
    listIdentities
  };
};
