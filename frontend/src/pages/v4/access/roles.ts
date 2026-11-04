import { format } from "date-fns";

import type { TOrgRole } from "@app/hooks/api/roles/types";

export type RoleGrant = {
  id: string;
  role: string;
  customRoleName?: string | null;
  customRoleSlug?: string | null;
  isTemporary: boolean;
  temporaryRange?: string | null;
  temporaryAccessStartTime?: string | null;
  temporaryAccessEndTime?: string | null;
};

const BUILT_IN_PROJECT_ROLE_NAMES: Record<string, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
  "no-access": "No Access",
  owner: "Owner"
};

export const builtInProjectRoleName = (slug: string) => BUILT_IN_PROJECT_ROLE_NAMES[slug] ?? slug;

export const grantSlug = (grant: Pick<RoleGrant, "role" | "customRoleSlug">) =>
  grant.role === "custom" ? (grant.customRoleSlug ?? grant.role) : grant.role;

export const grantLabel = (grant: Pick<RoleGrant, "role" | "customRoleName" | "customRoleSlug">) =>
  grant.role === "custom"
    ? (grant.customRoleName ?? grant.customRoleSlug ?? grant.role)
    : builtInProjectRoleName(grant.role);

export const isGrantExpired = (grant: Pick<RoleGrant, "isTemporary" | "temporaryAccessEndTime">) =>
  Boolean(
    grant.isTemporary &&
    grant.temporaryAccessEndTime &&
    new Date(grant.temporaryAccessEndTime).getTime() < Date.now()
  );

export const findOrgRole = (
  roles: readonly TOrgRole[] | undefined,
  ref: { role: string; roleId?: string | null }
) =>
  roles?.find((entry) =>
    ref.role === "custom" ? entry.id === ref.roleId : entry.slug === ref.role
  );

export const orgRoleSlug = (
  roles: readonly TOrgRole[] | undefined,
  ref: { role: string; roleId?: string | null }
) => (ref.role === "custom" ? (findOrgRole(roles, ref)?.slug ?? ref.role) : ref.role);

export const orgRoleName = (
  roles: readonly TOrgRole[] | undefined,
  ref: { role: string; roleId?: string | null }
) => findOrgRole(roles, ref)?.name ?? ref.role;

export const ORG_BUILT_IN_ROLES = ["admin", "member", "no-access"];
export const PROJECT_BUILT_IN_ROLES = ["admin", "member", "viewer", "no-access"];

export const formatDate = (value?: string | Date | null) =>
  value ? format(new Date(value), "MMM d, yyyy") : "";

export const formatDateTime = (value?: string | Date | null) =>
  value ? format(new Date(value), "MMM d, yyyy, h:mm a") : "";
