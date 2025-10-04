import { AccessScope } from "@app/db/schemas";
import { InternalServerError } from "@app/lib/errors";

import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TNamespaceMembershipIdentityScopeFactoryDep = Record<string, never>;

export const newNamespaceMembershipIdentityFactory = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deps: TNamespaceMembershipIdentityScopeFactoryDep
): TMembershipIdentityScopeFactory => {
  const getScopeField: TMembershipIdentityScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const getScopeDatabaseFields: TMembershipIdentityScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { scopeOrgId: dto.orgId, scopeNamespaceId: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const isCustomRole: TMembershipIdentityScopeFactory["isCustomRole"] = () => {
    throw new InternalServerError({ message: "Namespace membership user isCustomRole not implemented" });
  };

  const onCreateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onCreateMembershipIdentityGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace membership user create not implemented" });
    };

  const onUpdateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onUpdateMembershipIdentityGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace membership user update not implemented" });
    };

  const onDeleteMembershipIdentityGuard: TMembershipIdentityScopeFactory["onDeleteMembershipIdentityGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace membership user delete not implemented" });
    };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership user list not implemented" });
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace membership user get by user id not implemented" });
    };

  return {
    onCreateMembershipIdentityGuard,
    onUpdateMembershipIdentityGuard,
    onDeleteMembershipIdentityGuard,
    onListMembershipIdentityGuard,
    onGetMembershipIdentityByIdentityIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
