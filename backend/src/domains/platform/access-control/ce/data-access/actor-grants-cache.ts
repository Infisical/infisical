import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { readCacheFingerprint, withCacheFingerprint } from "@app/lib/cache/with-cache";

import { ActorGrants, TActorGrantsRecord } from "../models/actor-grants";
import { TActorGrantsCache, TGrantActor } from "../services/dependencies";

// The grants are kept ten minutes and served without a database read for ten seconds after they were last checked,
// then checked again against their fingerprint.
const MARKER_TTL_SECONDS = 10;
const DATA_TTL_SECONDS = 600;

// Bump the version when the cached shape changes, so a deploy never reads an older one.
const GrantKeys = {
  data: (projectId: string, actor: TGrantActor) =>
    `access-control:actor-grants:v1:data:${projectId}:${actor.type}:${actor.id}`,
  marker: (projectId: string, actor: TGrantActor) =>
    `access-control:actor-grants:v1:marker:${projectId}:${actor.type}:${actor.id}`
};

export class ActorGrantsCache implements TActorGrantsCache {
  constructor(
    private readonly keyStore: TDomainKeyStore,
    // 0 checks the fingerprint on every read: what tests use, so a change shows on the next request.
    private readonly markerTtlSeconds: number = MARKER_TTL_SECONDS
  ) {}

  async getOrLoad({
    actor,
    projectId,
    fingerprint,
    load
  }: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<ActorGrants>;
  }): Promise<ActorGrants> {
    const record = await withCacheFingerprint<TActorGrantsRecord>({
      keyStore: this.keyStore,
      dataKey: GrantKeys.data(projectId, actor),
      markerKey: GrantKeys.marker(projectId, actor),
      markerTtlSeconds: this.markerTtlSeconds,
      dataTtlSeconds: DATA_TTL_SECONDS,
      fingerprintFetcher: fingerprint,
      dataFetcher: async () => (await load()).toJSON()
    });
    return ActorGrants.restore(record);
  }

  readFingerprint({
    actor,
    projectId,
    fingerprint
  }: {
    actor: TGrantActor;
    projectId: string;
    fingerprint: () => Promise<string>;
  }): Promise<string> {
    return readCacheFingerprint({
      keyStore: this.keyStore,
      dataKey: GrantKeys.data(projectId, actor),
      markerKey: GrantKeys.marker(projectId, actor),
      markerTtlSeconds: this.markerTtlSeconds,
      fingerprintFetcher: fingerprint
    });
  }
}
