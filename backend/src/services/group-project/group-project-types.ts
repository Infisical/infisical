import { TProjectPermission, TProjectSlugPermission } from "@app/lib/types";

import { ProjectUserMembershipTemporaryMode } from "../project-membership/project-membership-types";

export type TCreateProjectGroupDTO = {
  groupSlug: string;
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
} & TProjectSlugPermission;

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
  groupSlug: string;
} & TProjectSlugPermission;

export type TDeleteProjectGroupDTO = {
  groupSlug: string;
} & TProjectSlugPermission;

export type TListProjectGroupDTO = TProjectSlugPermission;

export type TGetGroupInProjectDTO = TProjectPermission & { groupId: string };
