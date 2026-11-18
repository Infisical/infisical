import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TTransaction, unsealTransaction } from "@app/domains/lib/transactions";
import { TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";

import { FolderGrant, TFolderGrantRecord } from "../models/folder-grant";
import { TFolderGrantCache } from "../services/dependencies";

// The grants are kept ten minutes and served without a database read for ten seconds after they were last checked,
// then checked again against their fingerprint.
const MARKER_TTL_SECONDS = 10;
const DATA_TTL_SECONDS = 600;
const LEGACY_MARKER = "1";

// Must comfortably exceed DATA_TTL_SECONDS: an expired row reads as 0 and the next bump re-inserts at 1, so a short
// expiry lets a live cached value's fingerprint collide with the resurrected counter.
const FOLDER_VERSION_EXPIRY = "2d";

// The version is a Postgres key_value_store row, shared with the legacy permission service during a rolling deploy.
// Bump the cache version when the cached shape changes, so a deploy never reads an older one.
const FolderGrantKeys = {
  folderVersion: (projectId: string) => `project-folder-permission-version:${projectId}`,
  data: (projectId: string, actor: TGrantActor) =>
    `secrets:folder-grants:v1:data:${projectId}:${actor.type}:${actor.id}`,
  marker: (projectId: string, actor: TGrantActor) =>
    `secrets:folder-grants:v1:marker:${projectId}:${actor.type}:${actor.id}`
};

export class FolderGrantCache implements TFolderGrantCache {
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
    load: () => Promise<FolderGrant[]>;
  }): Promise<FolderGrant[]> {
    const records = await withCacheFingerprint<TFolderGrantRecord[]>({
      keyStore: this.keyStore,
      dataKey: FolderGrantKeys.data(projectId, actor),
      markerKey: FolderGrantKeys.marker(projectId, actor),
      markerTtlSeconds: this.markerTtlSeconds,
      dataTtlSeconds: DATA_TTL_SECONDS,
      fingerprintFetcher: fingerprint,
      dataFetcher: async () => (await load()).map((grant) => grant.toJSON())
    });
    return records.map((record) => FolderGrant.restore(record));
  }

  async findLiveFingerprint({ actor, projectId }: { actor: TGrantActor; projectId: string }): Promise<string | null> {
    if (this.markerTtlSeconds <= 0) return null;
    const marker = await this.keyStore.getItem(FolderGrantKeys.marker(projectId, actor));
    // A marker written before markers carried the fingerprint says nothing about which data is live.
    return marker && marker !== LEGACY_MARKER ? marker : null;
  }

  async getFolderVersion(projectId: string): Promise<number> {
    return (await this.keyStore.pgGetIntItem(FolderGrantKeys.folderVersion(projectId))) ?? 0;
  }

  async bumpFolderVersions({ projectIds, tx }: { projectIds: string[]; tx?: TTransaction }): Promise<void> {
    const trx = tx ? unsealTransaction(tx) : undefined;
    for await (const projectId of [...new Set(projectIds.filter(Boolean))]) {
      await this.keyStore.pgIncrementBy(FolderGrantKeys.folderVersion(projectId), {
        incr: 1,
        tx: trx,
        expiry: FOLDER_VERSION_EXPIRY
      });
    }
  }
}
