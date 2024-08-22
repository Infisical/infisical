import { TProjectPermission } from "@app/lib/types";

import { ProjectUserMembershipTemporaryMode } from "../project-membership/project-membership-types";

export type TCreateProjectIdentityDTO = {
  identityId: string;
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

export type TUpdateProjectIdentityDTO = {
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
  identityId: string;
} & TProjectPermission;

export type TDeleteProjectIdentityDTO = {
  identityId: string;
} & TProjectPermission;

export type TListProjectIdentityDTO = TProjectPermission;

export type TGetProjectIdentityByIdentityIdDTO = {
  identityId: string;
} & TProjectPermission;
