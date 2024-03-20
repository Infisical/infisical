import { TProjectPermission } from "@app/lib/types";

import { ProjectUserMembershipTemporaryMode } from "../project-membership/project-membership-types";

export type TCreateProjectGroupDTO = {
  groupSlug: string;
  role: string;
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
  groupSlug: string;
} & TProjectPermission;

export type TDeleteProjectGroupDTO = {
  groupSlug: string;
} & TProjectPermission;

export type TListProjectGroupDTO = TProjectPermission;
