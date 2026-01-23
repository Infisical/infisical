import { AccessScope } from "@app/db/schemas/models";
import { InternalServerError } from "@app/lib/errors";

import { TAdditionalPrivilegesScopeFactory } from "../additional-privilege-types";

type TNamespaceAdditionalPrivilegesScopeFactoryDep = Record<string, never>;

export const newNamespaceAdditionalPrivilegesFactory = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deps: TNamespaceAdditionalPrivilegesScopeFactoryDep
): TAdditionalPrivilegesScopeFactory => {
  const getScopeField: TAdditionalPrivilegesScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Namespace) {
      return { key: "namespaceId" as const, value: dto.namespaceId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the namespace factory" });
  };

  const onCreateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onCreateAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace additional privileges create not implemented" });
    };

  const onUpdateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onUpdateAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace additional privileges update not implemented" });
    };

  const onDeleteAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onDeleteAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace additional privileges delete not implemented" });
    };

  const onListAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onListAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace additional privileges list not implemented" });
    };

  const onGetAdditionalPrivilegesByIdGuard: TAdditionalPrivilegesScopeFactory["onGetAdditionalPrivilegesByIdGuard"] =
    async () => {
      throw new InternalServerError({ message: "Namespace additional privileges get by id not implemented" });
    };

  return {
    onCreateAdditionalPrivilegesGuard,
    onUpdateAdditionalPrivilegesGuard,
    onDeleteAdditionalPrivilegesGuard,
    onListAdditionalPrivilegesGuard,
    onGetAdditionalPrivilegesByIdGuard,
    getScopeField
  };
};
