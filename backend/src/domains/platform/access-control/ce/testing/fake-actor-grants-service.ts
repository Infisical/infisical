import { AccessScope } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";

import { TActorGrantsService } from "../services/actor-grants/service";
import { TGrantActor, TGrantScope, TGrantStore } from "../services/dependencies";

// For other domains' tests: the real service's answers straight from a store, with no cache in between.
export class FakeActorGrantsService implements TActorGrantsService {
  constructor(private readonly grantStore: TGrantStore) {}

  getActorGrants({ actor, scope }: { actor: TGrantActor; scope: TGrantScope }, options?: TReadOptions) {
    return this.grantStore.findActorGrants(actor, scope, options);
  }

  getCachedProjectGrants({ actor, orgId, projectId }: { actor: TGrantActor; orgId: string; projectId: string }) {
    return this.grantStore.findActorGrants(actor, { scope: AccessScope.Project, orgId, projectId });
  }

  getGrantsFingerprint({ actor, orgId, projectId }: { actor: TGrantActor; orgId: string; projectId: string }) {
    return this.grantStore.findGrantsFingerprint(actor, { orgId, projectId });
  }

  getCachedGrantsFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }) {
    return this.getGrantsFingerprint(input);
  }

  getProjectMemberGrants(scope: { orgId: string; projectId: string }) {
    return this.grantStore.findProjectMemberGrants(scope);
  }

  listFolderGrants(input: { actor: TGrantActor; projectId: string }) {
    return this.grantStore.findFolderGrants(input);
  }

  listProjectFolderGrants(input: { projectId: string }) {
    return this.grantStore.findProjectFolderGrants(input);
  }

  listResourceMemberships(input: { actor: TGrantActor; projectId: string; resourceType: string }) {
    return this.grantStore.findResourceMembershipsForActor(input);
  }
}
