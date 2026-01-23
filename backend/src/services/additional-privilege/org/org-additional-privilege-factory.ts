import { AccessScope } from "@app/db/schemas/models";
import { InternalServerError } from "@app/lib/errors";

import { TAdditionalPrivilegesScopeFactory } from "../additional-privilege-types";

type TOrgAdditionalPrivilegesScopeFactoryDep = Record<string, never>;

export const newOrgAdditionalPrivilegesFactory = (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deps: TOrgAdditionalPrivilegesScopeFactoryDep
): TAdditionalPrivilegesScopeFactory => {
  const getScopeField: TAdditionalPrivilegesScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const onCreateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onCreateAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Org additional privileges create not implemented" });
    };

  const onUpdateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onUpdateAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Org additional privileges update not implemented" });
    };

  const onDeleteAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onDeleteAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Org additional privileges delete not implemented" });
    };

  const onListAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onListAdditionalPrivilegesGuard"] =
    async () => {
      throw new InternalServerError({ message: "Org additional privileges list not implemented" });
    };

  const onGetAdditionalPrivilegesByIdGuard: TAdditionalPrivilegesScopeFactory["onGetAdditionalPrivilegesByIdGuard"] =
    async () => {
      throw new InternalServerError({ message: "Org additional privileges get by id not implemented" });
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
