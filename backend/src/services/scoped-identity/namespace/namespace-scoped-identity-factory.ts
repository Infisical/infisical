import { ForbiddenError } from "@casl/ability";

import { AccessScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  NamespacePermissionIdentityActions,
  NamespacePermissionSubjects
} from "@app/ee/services/permission/namespace-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";

import { TIdentityScopeFactory } from "../scoped-identity-types";

type TNamespaceScopedIdentityFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getNamespacePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "create">;
};

export const newNamespaceScopedIdentityFactory = ({
  permissionService,
  licenseService,
  membershipIdentityDAL
}: TNamespaceScopedIdentityFactoryDep): TIdentityScopeFactory => {
  const getScopeField: TIdentityScopeFactory["getScopeField"] = (scopeData) => {
    if (scopeData.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: scopeData.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const onCreateIdentityGuard: TIdentityScopeFactory["onCreateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Create,
      NamespacePermissionSubjects.Identity
    );

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan.namespace) {
      throw new BadRequestError({
        message: "Failed to create namespace scoped identity. Upgrade plan to use namespace."
      });
    }
  };

  const onCreateIdentityDBOperations: TIdentityScopeFactory["onCreateIdentityDBOperations"] = async (
    dto,
    identityId,
    tx
  ) => {
    const scopeData = getScopeField(dto.scopeData);

    const namespaceMembership = await membershipIdentityDAL.create(
      {
        scope: AccessScope.Namespace,
        actorIdentityId: identityId,
        scopeOrgId: dto.permission.orgId,
        scopeNamespaceId: scopeData.value
      },
      tx
    );
    return { membershipIds: [namespaceMembership.id] };
  };

  const onUpdateIdentityGuard: TIdentityScopeFactory["onUpdateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Edit,
      NamespacePermissionSubjects.Identity
    );
  };

  const onDeleteIdentityGuard: TIdentityScopeFactory["onDeleteIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Delete,
      NamespacePermissionSubjects.Identity
    );
  };

  const onListIdentityGuard: TIdentityScopeFactory["onListIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Read,
      NamespacePermissionSubjects.Identity
    );
  };

  const onGetIdentityByIdGuard: TIdentityScopeFactory["onGetIdentityByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getNamespacePermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actorAuthMethod: dto.permission.authMethod,
      namespaceId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      NamespacePermissionIdentityActions.Read,
      NamespacePermissionSubjects.Identity
    );
  };

  return {
    onCreateIdentityGuard,
    onCreateIdentityDBOperations,
    onUpdateIdentityGuard,
    onDeleteIdentityGuard,
    onListIdentityGuard,
    onGetIdentityByIdGuard,
    getScopeField
  };
};
