import { DataAccessDb } from "@app/domains/lib/data-access-db";

import { GrantDataAccess, TGrantDataAccess } from "./grant-data-access";
import { GroupDataAccess, TGroupDataAccess } from "./group-data-access";
import { IdentityAttributeDataAccess, TIdentityAttributeDataAccess } from "./identity-attribute-data-access";
import { MembershipDataAccess, TMembershipDataAccess } from "./membership-data-access";
import { PrivilegeDataAccess, TPrivilegeDataAccess } from "./privilege-data-access";
import { RoleDataAccess, TRoleDataAccess } from "./role-data-access";

export type TAccessControlDataAccess = {
  grants: TGrantDataAccess;
  memberships: TMembershipDataAccess;
  roles: TRoleDataAccess;
  privileges: TPrivilegeDataAccess;
  groups: TGroupDataAccess;
  attributes: TIdentityAttributeDataAccess;
};

export const buildAccessControlDataAccess = (db: DataAccessDb): TAccessControlDataAccess => ({
  grants: new GrantDataAccess(db),
  memberships: new MembershipDataAccess(db),
  roles: new RoleDataAccess(db),
  privileges: new PrivilegeDataAccess(db),
  groups: new GroupDataAccess(db),
  attributes: new IdentityAttributeDataAccess(db)
});
