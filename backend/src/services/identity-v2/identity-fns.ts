import { MongoAbility, subject } from "@casl/ability";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

import { SearchIdentitiesScope } from "./identity-types";

export type TProjectPermissionAbility = MongoAbility<ProjectPermissionSet>;

// Drops project-scope rows whose `identityId` fails the per-row CASL check. Org-scope rows are
// unconditional (org-level Identity rules don't accept conditions) and pass through. Rows in
// projects whose Read(Identity) rules carry no conditions also pass through without a CASL call:
// the broader `can(Read, Identity)` check during scope resolution already authorized them.
export const filterIdentitiesByProjectPermission = <
  TRow extends { identityId: string; scope: SearchIdentitiesScope; projectId?: string | null }
>(
  rows: TRow[],
  projectPermissions: Map<string, TProjectPermissionAbility>,
  conditionalProjectIds: Set<string>
): TRow[] =>
  rows.filter((row) => {
    if (row.scope !== SearchIdentitiesScope.ProjectScope) return true;
    if (!row.projectId) return false;
    if (!conditionalProjectIds.has(row.projectId)) return true;
    const projectPermission = projectPermissions.get(row.projectId);
    if (!projectPermission) return false;
    return projectPermission.can(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: row.identityId })
    );
  });
