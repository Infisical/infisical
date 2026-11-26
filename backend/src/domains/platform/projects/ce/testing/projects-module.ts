import { TDbClient } from "@app/db";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { accessControlServices } from "@app/domains/platform/access-control/ce/testing/access-control-services";
import { OrganizationsModule } from "@app/domains/platform/organizations/ce/module";

import { TProjectRoles } from "../models/standard-project-roles";
import { ProjectsModule } from "../module";

// Postgres-backed, caches off, standard roles unless a test passes others.
export const buildProjectsModule = (db: TDbClient, { projectRoles = [] }: { projectRoles?: TProjectRoles[] } = {}) => {
  const accessControl = accessControlServices(db);
  const organizations = new OrganizationsModule({ db, ...accessControl });
  return new ProjectsModule({
    db,
    keyStore: new InMemoryKeyStore(),
    ...accessControl,
    orgPermissionService: organizations.orgPermissionService,
    projectRoles,
    cacheMarkerTtlSeconds: 0
  });
};
