import { TProjectPermission } from "@app/lib/types";

import { ProjectUserMembershipTemporaryMode } from "../project-membership/project-membership-types";

export type TCreateProjectGroupDTO = {
  groupId: string;
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
} & TProjectPermission;

export type TUpdateProjectGroupDTO = {
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
  groupId: string;
} & TProjectPermission;

export type TDeleteProjectGroupDTO = {
  groupId: string;
} & TProjectPermission;

export type TListProjectGroupDTO = TProjectPermission;

export type TGetGroupInProjectDTO = TProjectPermission & { groupId: string };
