import { isCustomProjectRole } from "@app/helpers/roles";
import type { TProjectTemplate } from "@app/hooks/api/projectTemplates";

export const customRoles = (template: TProjectTemplate) =>
  template.roles.filter((role) => isCustomProjectRole(role.slug));

export const roleUsage = (template: TProjectTemplate, slug: string) => {
  const count = (list?: { roles: string[] }[] | null) =>
    (list ?? []).filter((entry) => entry.roles.includes(slug)).length;
  const users = count(template.users);
  const groups = count(template.groups);
  const identities = count(template.identities) + count(template.projectManagedIdentities);
  return [
    users && `${users} user${users === 1 ? "" : "s"}`,
    groups && `${groups} group${groups === 1 ? "" : "s"}`,
    identities && `${identities} identit${identities === 1 ? "y" : "ies"}`
  ].filter(Boolean) as string[];
};
