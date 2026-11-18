import { Role } from "../../models/role";
import { TGrantStore, TRoleOwner } from "../dependencies";

export type TRoleService = {
  // The org's or project's custom roles with these slugs; slugs with no role are left out.
  findRolesBySlugs(input: { owner: TRoleOwner; slugs: string[] }): Promise<Role[]>;
};

export class RoleService implements TRoleService {
  constructor(private readonly grantStore: TGrantStore) {}

  findRolesBySlugs(input: { owner: TRoleOwner; slugs: string[] }) {
    return this.grantStore.findRolesBySlugs(input);
  }
}
