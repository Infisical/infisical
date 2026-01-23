import { AccessScope } from "@app/db/schemas/models";
import { InternalServerError } from "@app/lib/errors";

import { TMembershipUserScopeFactory } from "../membership-user-types";

type TNamespaceMembershipUserScopeFactoryDep = Record<string, never>;

export const newNamespaceMembershipUserFactory = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deps: TNamespaceMembershipUserScopeFactoryDep
): TMembershipUserScopeFactory => {
  const getScopeField: TMembershipUserScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const getScopeDatabaseFields: TMembershipUserScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { scopeOrgId: dto.orgId, scopeNamespaceId: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const isCustomRole: TMembershipUserScopeFactory["isCustomRole"] = () => {
    throw new InternalServerError({ message: "Namespace membership user isCustomRole not implemented" });
  };

  const onCreateMembershipUserGuard: TMembershipUserScopeFactory["onCreateMembershipUserGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership user create not implemented" });
  };

  const onCreateMembershipComplete: TMembershipUserScopeFactory["onCreateMembershipComplete"] = async () => {
    throw new InternalServerError({ message: "Namespace membership user create complete not implemented" });
  };

  const onUpdateMembershipUserGuard: TMembershipUserScopeFactory["onUpdateMembershipUserGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership user update not implemented" });
  };

  const onDeleteMembershipUserGuard: TMembershipUserScopeFactory["onDeleteMembershipUserGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership user delete not implemented" });
  };

  const onListMembershipUserGuard: TMembershipUserScopeFactory["onListMembershipUserGuard"] = async () => {
    throw new InternalServerError({ message: "Namespace membership user list not implemented" });
  };

  const onGetMembershipUserByUserIdGuard: TMembershipUserScopeFactory["onGetMembershipUserByUserIdGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace membership user get by user id not implemented" });
    };

  return {
    onCreateMembershipUserGuard,
    onCreateMembershipComplete,
    onUpdateMembershipUserGuard,
    onDeleteMembershipUserGuard,
    onListMembershipUserGuard,
    onGetMembershipUserByUserIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
