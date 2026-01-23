import { AccessScope } from "@app/db/schemas/models";
import { InternalServerError } from "@app/lib/errors";

import { TMembershipGroupScopeFactory } from "../membership-group-types";

type TNamespaceMembershipGroupScopeFactoryDep = Record<string, never>;

export const newNamespaceMembershipGroupFactory = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deps: TNamespaceMembershipGroupScopeFactoryDep
): TMembershipGroupScopeFactory => {
  const getScopeField: TMembershipGroupScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const getScopeDatabaseFields: TMembershipGroupScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { scopeOrgId: dto.orgId, scopeNamespaceId: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const isCustomRole: TMembershipGroupScopeFactory["isCustomRole"] = () => {
    throw new InternalServerError({ message: "Namespace membership group isCustomRole not implemented" });
  };

  const onCreateMembershipGroupGuard: TMembershipGroupScopeFactory["onCreateMembershipGroupGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership group create not implemented" });
  };

  const onUpdateMembershipGroupGuard: TMembershipGroupScopeFactory["onUpdateMembershipGroupGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership group update not implemented" });
  };

  const onDeleteMembershipGroupGuard: TMembershipGroupScopeFactory["onDeleteMembershipGroupGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership group delete not implemented" });
  };

  const onListMembershipGroupGuard: TMembershipGroupScopeFactory["onListMembershipGroupGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership group list not implemented" });
  };

  const onGetMembershipGroupByGroupIdGuard: TMembershipGroupScopeFactory["onGetMembershipGroupByGroupIdGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace membership group get by group id not implemented" });
    };

  return {
    onCreateMembershipGroupGuard,
    onUpdateMembershipGroupGuard,
    onDeleteMembershipGroupGuard,
    onListMembershipGroupGuard,
    onGetMembershipGroupByGroupIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
