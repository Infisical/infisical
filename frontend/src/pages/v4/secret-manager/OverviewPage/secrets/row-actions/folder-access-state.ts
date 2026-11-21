import type { SecretFolderRole } from "@app/hooks/api/folderAccess/types";

export type FolderGrant = {
  permission: SecretFolderRole;
  isTemporary: boolean;
  temporaryRange: string | null;
  temporaryAccessEndTime: string | null;
};
export type AccessMember = {
  type: "user" | "identity";
  id: string;
  name: string;
  subtitle: string;
  isProjectAdmin: boolean;
  roles: string[];
  inProject: boolean;
  hasAccess: boolean;
};
export type AccessState = {
  members: AccessMember[];
  grants: Record<string, Record<string, FolderGrant>>;
};
export const grantKey = (environment: string, path: string) => `${environment}:${path}`;
export const memberKey = (member: Pick<AccessMember, "type" | "id">) =>
  `${member.type}:${member.id}`;
