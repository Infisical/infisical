import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { DataAccessDb } from "@app/domains/lib/data-access-db";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import type { TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";

import { FolderPathDataAccess } from "./data-access/folder-path-data-access";
import { ServiceTokenDataAccess } from "./data-access/service-token-data-access";
import { SecretsPermissionService, TSecretsPermission } from "./service/secrets-permission";

export * from "./service/folder-grant-rules";
export * from "./service/folder-roles";
export type { TSecretsPermission } from "./service/secrets-permission";

export type TSecretsDomain = {
  // What the actor may do in a Secret Manager project: its project roles, with its folder grants overriding them at
  // their folders. A service token gets the scopes it was issued with.
  getSecretsPermission: (input: { actor: TActorContext; projectId: string }) => Promise<TSecretsPermission>;
};

export type TSecretsDeps = {
  db: DataAccessDb;
  keyStore: TDomainKeyStore;
  projectsDomain: TProjectsDomain;
  accessControlDomain: TAccessControlDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds its usage counter and its permission for now; it grows as Secret Manager moves into a domain.
export class SecretsModule {
  readonly name = "secrets";

  readonly service: TSecretsDomain;

  constructor({ db, keyStore, projectsDomain, accessControlDomain, licenseRegistry }: TSecretsDeps) {
    const permissions = new SecretsPermissionService({
      projectsDomain,
      accessControlDomain,
      keyStore,
      folderPaths: new FolderPathDataAccess(db),
      serviceTokens: new ServiceTokenDataAccess(db)
    });
    this.service = { getSecretsPermission: (input) => permissions.getSecretsPermission(input) };

    licenseRegistry.registerUsageCounter({
      meter: Meter.SecretIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.SecretManager, orgId ?? undefined)
    });
  }
}
