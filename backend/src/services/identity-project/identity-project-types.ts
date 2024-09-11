import { OrderByDirection, TProjectPermission } from "@app/lib/types";

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

export type TListProjectIdentityDTO = {
  limit?: number;
  offset?: number;
  orderBy?: ProjectIdentityOrderBy;
  direction?: OrderByDirection;
  textFilter?: string;
} & TProjectPermission;

export type TGetProjectIdentityByIdentityIdDTO = {
  identityId: string;
} & TProjectPermission;

export enum ProjectIdentityOrderBy {
  Name = "name"
}
