import { MongoAbility, subject } from "@casl/ability";

import { IdentityAuthMethod } from "@app/db/schemas";
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

export const buildAuthMethods = ({
  uaId,
  gcpId,
  alicloudId,
  awsId,
  kubernetesId,
  ociId,
  oidcId,
  azureId,
  tokenId,
  jwtId,
  ldapId,
  tlsCertId,
  spiffeId
}: {
  uaId?: string;
  gcpId?: string;
  alicloudId?: string;
  awsId?: string;
  kubernetesId?: string;
  ociId?: string;
  oidcId?: string;
  azureId?: string;
  tokenId?: string;
  jwtId?: string;
  ldapId?: string;
  tlsCertId?: string;
  spiffeId?: string;
}) => {
  return [
    ...[uaId ? IdentityAuthMethod.UNIVERSAL_AUTH : null],
    ...[gcpId ? IdentityAuthMethod.GCP_AUTH : null],
    ...[alicloudId ? IdentityAuthMethod.ALICLOUD_AUTH : null],
    ...[awsId ? IdentityAuthMethod.AWS_AUTH : null],
    ...[kubernetesId ? IdentityAuthMethod.KUBERNETES_AUTH : null],
    ...[ociId ? IdentityAuthMethod.OCI_AUTH : null],
    ...[oidcId ? IdentityAuthMethod.OIDC_AUTH : null],
    ...[azureId ? IdentityAuthMethod.AZURE_AUTH : null],
    ...[tokenId ? IdentityAuthMethod.TOKEN_AUTH : null],
    ...[jwtId ? IdentityAuthMethod.JWT_AUTH : null],
    ...[ldapId ? IdentityAuthMethod.LDAP_AUTH : null],
    ...[tlsCertId ? IdentityAuthMethod.TLS_CERT_AUTH : null],
    ...[spiffeId ? IdentityAuthMethod.SPIFFE_AUTH : null]
  ].filter((authMethod) => authMethod) as IdentityAuthMethod[];
};
