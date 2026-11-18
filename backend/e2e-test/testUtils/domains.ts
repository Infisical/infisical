import type { Knex } from "knex";

import { AgentVaultProjectRoles } from "@app/domains/agent-vault/agent-vault/ee/module";
import { AccessBundlePermissionService } from "@app/domains/agent-vault/agent-vault/ee/services/access-bundle-permission/service";
import { kmsProjectRoles } from "@app/domains/kms/kms/ce/module";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { PamProjectRoles } from "@app/domains/pam/pam/ce/module";
import { AccessControlModule } from "@app/domains/platform/access-control/ce/module";
import { OrganizationsModule } from "@app/domains/platform/organizations/ce/module";
import { ProjectsModule } from "@app/domains/platform/projects/ce/module";
import { SecretsModule } from "@app/domains/secrets-manager/secrets/ce/module";

// The permission domains over the database and key store the test server runs on, built the way createDomains builds
// them with the caches' markers off, so a spec checks permissions without starting the License, KMS or queues.
export const buildPermissionDomains = (db: Knex, keyStore: TDomainKeyStore) => {
  const accessControl = new AccessControlModule({ db, keyStore, cacheMarkerTtlSeconds: 0 });
  const organizations = new OrganizationsModule({
    db,
    actorGrantsService: accessControl.actorGrantsService,
    roleService: accessControl.roleService
  });
  const projects = new ProjectsModule({
    db,
    keyStore,
    actorGrantsService: accessControl.actorGrantsService,
    roleService: accessControl.roleService,
    groupService: accessControl.groupService,
    orgPermissionService: organizations.orgPermissionService,
    projectRoles: [new PamProjectRoles(), new AgentVaultProjectRoles(), kmsProjectRoles],
    cacheMarkerTtlSeconds: 0
  });
  const secrets = new SecretsModule({
    db,
    keyStore,
    projectPermissionService: projects.projectPermissionService,
    actorGrantsService: accessControl.actorGrantsService,
    groupService: accessControl.groupService,
    projectsService: projects.projectsService,
    cacheMarkerTtlSeconds: 0
  });

  return {
    actorContextService: organizations.actorContextService,
    orgPermissionService: organizations.orgPermissionService,
    projectPermissionService: projects.projectPermissionService,
    secretsPermissionService: secrets.secretsPermissionService,
    accessBundlePermissionService: new AccessBundlePermissionService(
      projects.projectPermissionService,
      accessControl.actorGrantsService
    )
  };
};
