import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { readCacheFingerprint, withCacheFingerprint } from "@app/lib/cache/with-cache";
import { logger } from "@app/lib/logger";

import { ActorGrants, TActorGrantsRecord } from "../models/actor-grants";
import { TActorGrantsCache, TGrantActor } from "../services/dependencies";

// Cached 10 min. Served without a DB read for 10s after the last fingerprint check, then rechecked.
const MARKER_TTL_SECONDS = 10;
const DATA_TTL_SECONDS = 600;

// Bump the version when the cached shape changes so a deploy never reads an old one.
const GrantKeys = {
  data: (projectId: string, actor: TGrantActor) =>
    `access-control:actor-grants:v2:data:${projectId}:${actor.type}:${actor.id}`,
  marker: (projectId: string, actor: TGrantActor) =>
    `access-control:actor-grants:v2:marker:${projectId}:${actor.type}:${actor.id}`
};

export class ActorGrantsCache implements TActorGrantsCache {
  constructor(
    private readonly keyStore: TDomainKeyStore,
    // 0 = check the fingerprint on every read. Tests use it so changes show up on the next request.
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
    const grants = ActorGrants.restore(record);
    // Never cache a refusal: someone just added (SCIM group push, accepted invite) must get in on their next request.
    if (!grants.hasMembership) {
      await Promise.all(
        [GrantKeys.data(projectId, actor), GrantKeys.marker(projectId, actor)].map((key) =>
          this.keyStore.deleteItem(key).catch((err: unknown) => {
            logger.warn({ key, err }, `ActorGrantsCache: refusal delete failed [key=${key}]`);
          })
        )
      );
    }
    return grants;
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
