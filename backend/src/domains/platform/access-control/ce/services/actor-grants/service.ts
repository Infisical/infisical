import { AccessScope } from "@app/db/schemas";
import { TReadOptions } from "@app/domains/lib/data-access";

import { ActorGrants } from "../../models/actor-grants";
import { Membership } from "../../models/membership";
import { Privilege } from "../../models/privilege";
import { ProjectMemberGrants } from "../../models/project-member-grants";
import { TActorGrantsCache, TGrantActor, TGrantScope, TGrantStore } from "../dependencies";

export type TActorGrantsService = {
  // What the actor holds at the scope, read now. Empty when it has no membership there.
  getActorGrants(input: { actor: TGrantActor; scope: TGrantScope }, options?: TReadOptions): Promise<ActorGrants>;
  // The actor's grants in a project, from the cache while their fingerprint is unchanged: what a project's
  // permission is built from on every request.
  getCachedProjectGrants(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<ActorGrants>;
  // A hash of everything the actor's grants in one project (its resources and its org included) are read from, for
  // other caches' keys.
  getGrantsFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  // The fingerprint of the grants getCachedProjectGrants serves now, read from the cache while it is fresh, so a cache
  // keyed by it never pairs a newer fingerprint with older grants.
  getCachedGrantsFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  // Everyone's grants in a project, for listings over all members.
  getProjectMemberGrants(input: { orgId: string; projectId: string }): Promise<ProjectMemberGrants>;
  listFolderGrants(input: { actor: TGrantActor; projectId: string }): Promise<Privilege[]>;
  listProjectFolderGrants(input: { projectId: string }): Promise<Privilege[]>;
  listResourceMemberships(input: {
    actor: TGrantActor;
    projectId: string;
    resourceType: string;
  }): Promise<Membership[]>;
};

export class ActorGrantsService implements TActorGrantsService {
  constructor(
    private readonly grantStore: TGrantStore,
    private readonly actorGrantsCache: TActorGrantsCache
  ) {}

  getActorGrants({ actor, scope }: { actor: TGrantActor; scope: TGrantScope }, options?: TReadOptions) {
    return this.grantStore.findActorGrants(actor, scope, options);
  }

  getCachedProjectGrants({ actor, orgId, projectId }: { actor: TGrantActor; orgId: string; projectId: string }) {
    return this.actorGrantsCache.getOrLoad({
      actor,
      projectId,
      fingerprint: () => this.grantStore.findGrantsFingerprint(actor, { orgId, projectId }),
      load: () => this.grantStore.findActorGrants(actor, { scope: AccessScope.Project, orgId, projectId })
    });
  }

  getGrantsFingerprint({ actor, orgId, projectId }: { actor: TGrantActor; orgId: string; projectId: string }) {
    return this.grantStore.findGrantsFingerprint(actor, { orgId, projectId });
  }

  getCachedGrantsFingerprint({ actor, orgId, projectId }: { actor: TGrantActor; orgId: string; projectId: string }) {
    return this.actorGrantsCache.readFingerprint({
      actor,
      projectId,
      fingerprint: () => this.grantStore.findGrantsFingerprint(actor, { orgId, projectId })
    });
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
