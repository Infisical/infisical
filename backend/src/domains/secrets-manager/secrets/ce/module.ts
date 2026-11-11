import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import type { TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";

import { FolderPathDataAccess } from "./data-access/folder-path-data-access";
import { MemberNameDataAccess } from "./data-access/member-name-data-access";
import { ServiceTokenDataAccess } from "./data-access/service-token-data-access";
import { SecretsMemberAccess } from "./service/secrets-member-access";
import { SecretsPermissionService, TSecretsPermission } from "./service/secrets-permission";

export * from "./service/folder-grant-rules";
export * from "./service/folder-roles";
export * from "./service/secret-read-checks";
export type {
  TDirectMemberPermission,
  TMemberRoleSummary,
  TGroupMemberPermission,
  TProjectMemberPermissions
} from "./service/secrets-member-access";
export type { TSecretsPermission } from "./service/secrets-permission";

export type TSecretsDomain = {
  // What the actor may do in a Secret Manager project: its project roles, with its folder grants overriding them at
  // their folders. A service token gets the scopes it was issued with.
  getSecretsPermission: (input: { actor: TActorContext; projectId: string }) => Promise<TSecretsPermission>;
  // Every member's permission in the project (users, identities and groups), folder grants included, for listings
  // of who can reach a secret. The caller checks the request may see them.
  getProjectMemberPermissions: SecretsMemberAccess["getProjectMemberPermissions"];
  // A member's active folder grants as permission audit sources; none outside Secret Manager or for an admin.
  getFolderGrantAuditSources: SecretsMemberAccess["getFolderGrantAuditSources"];
  // Each of a member's active folder grants as a permission of its own (allow rules only).
  getFolderGrantPermissions: SecretsMemberAccess["getFolderGrantPermissions"];
  // Makes cached folder grants of these projects revalidate; call it in the transaction that changes a folder grant
  // or the folder tree.
  invalidateFolderGrants: SecretsPermissionService["invalidateFolderGrants"];
  // Changes whenever the actor's Secret Manager permission in the project may have; for caches derived from it.
  getPermissionFingerprint: SecretsPermissionService["getPermissionFingerprint"];
};

export type TSecretsDeps = {
  db: DataAccessDb;
  keyStore: TDomainKeyStore;
  projectsDomain: TProjectsDomain;
  accessControlDomain: TAccessControlDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds its usage counter and its permissions for now; it grows as Secret Manager moves into a domain.
export class SecretsModule {
  readonly name = "secrets";

  readonly service: TSecretsDomain;

  constructor({ db, keyStore, projectsDomain, accessControlDomain, licenseRegistry }: TSecretsDeps) {
    const folderPaths = new FolderPathDataAccess(db);
    const permissions = new SecretsPermissionService({
      projectsDomain,
      accessControlDomain,
      keyStore,
      folderPaths,
      serviceTokens: new ServiceTokenDataAccess(db)
    });
    const memberAccess = new SecretsMemberAccess({
      projectsDomain,
      accessControlDomain,
      folderPaths,
      memberNames: new MemberNameDataAccess(db)
    });
    this.service = {
      getSecretsPermission: (input) => permissions.getSecretsPermission(input),
      getProjectMemberPermissions: (input) => memberAccess.getProjectMemberPermissions(input),
      getFolderGrantAuditSources: (input) => memberAccess.getFolderGrantAuditSources(input),
      getFolderGrantPermissions: (input) => memberAccess.getFolderGrantPermissions(input),
      invalidateFolderGrants: (input) => permissions.invalidateFolderGrants(input),
      getPermissionFingerprint: (input) => permissions.getPermissionFingerprint(input)
    };

    licenseRegistry.registerUsageCounter({
      meter: Meter.SecretIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.SecretManager, orgId ?? undefined)
    });
  }
}
