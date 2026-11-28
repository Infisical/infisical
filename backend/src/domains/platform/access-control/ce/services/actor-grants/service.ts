import { AccessScope } from "@app/db/schemas";
import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";

import { ActorGrants } from "../../models/actor-grants";
import { Membership } from "../../models/membership";
import { Privilege } from "../../models/privilege";
import { ProjectMemberGrants } from "../../models/project-member-grants";
import { TActorGrantsCache, TActorMembership, TGrantActor, TGrantScope, TGrantStore } from "../dependencies";

type TResourceMembershipsForActorsInput = { actors: TGrantActor[]; projectId: string; resourceTypes: string[] };

// Reads on the caller's tx, so a check sees membership writes it hasn't committed yet.
export type TActorGrantsTransaction = {
  listResourceMembershipsForActors(input: TResourceMembershipsForActorsInput): Promise<TActorMembership[]>;
};

export type TActorGrantsService = {
  // Uncached read. Empty if the actor has no membership at the scope.
  getActorGrants(input: { actor: TGrantActor; scope: TGrantScope }, options?: TReadOptions): Promise<ActorGrants>;
  // Cached while the fingerprint is unchanged. Project permissions are built from this on every request.
  getCachedProjectGrants(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<ActorGrants>;
  // Hash of everything the actor's project grants are read from (incl. its resources and org), for other caches' keys.
  getGrantsFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  // Fingerprint of what getCachedProjectGrants serves right now (cached while fresh), so a cache keyed by it never
  // pairs a newer fingerprint with older grants.
  getCachedGrantsFingerprint(input: { actor: TGrantActor; orgId: string; projectId: string }): Promise<string>;
  getProjectMemberGrants(input: { orgId: string; projectId: string }): Promise<ProjectMemberGrants>;
  listFolderGrants(input: { actor: TGrantActor; projectId: string }): Promise<Privilege[]>;
  listProjectFolderGrants(input: { projectId: string }): Promise<Privilege[]>;
  listResourceMemberships(input: {
    actor: TGrantActor;
    projectId: string;
    resourceType: string;
  }): Promise<Membership[]>;
  // Includes memberships through groups and inactive ones, each paired with its actor.
  listResourceMembershipsForActors(input: TResourceMembershipsForActorsInput): Promise<TActorMembership[]>;
  within(tx: TTransaction): TActorGrantsTransaction;
};

export class ActorGrantsService implements TActorGrantsService {
  constructor(
    private readonly grantStore: TGrantStore,
    private readonly actorGrantsCache: TActorGrantsCache,
    private readonly transactionRunner: TTransactionRunner<{ grantStore: TGrantStore }>
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

  // Primary read: the folder grant cache stores these under the folder version read alongside, so a stale replica
  // could keep a revoked grant alive under the newer version for the cache's lifetime.
  listFolderGrants(input: { actor: TGrantActor; projectId: string }) {
    return this.grantStore.findFolderGrants(input, { readFrom: ReadFrom.Primary });
  }

  listProjectFolderGrants(input: { projectId: string }) {
    return this.grantStore.findProjectFolderGrants(input, { readFrom: ReadFrom.Primary });
  }

  listResourceMemberships(input: { actor: TGrantActor; projectId: string; resourceType: string }) {
    return this.grantStore.findResourceMembershipsForActor(input);
  }

  listResourceMembershipsForActors(input: TResourceMembershipsForActorsInput) {
    return this.grantStore.findResourceMembershipsForActors(input);
  }

  within(tx: TTransaction): TActorGrantsTransaction {
    const runner = this.transactionRunner.within(tx);
    return {
      listResourceMembershipsForActors: (input) =>
        runner.run(({ stores }) => stores.grantStore.findResourceMembershipsForActors(input))
    };
  }
}
