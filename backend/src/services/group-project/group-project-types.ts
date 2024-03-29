import { TProjectSlugPermission } from "@app/lib/types";

import { ProjectUserMembershipTemporaryMode } from "../project-membership/project-membership-types";

export type TCreateProjectGroupDTO = {
  groupSlug: string;
  role: string;
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
