import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TTransaction, unsealTransaction } from "@app/domains/lib/transactions";
import { TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";

import { FolderGrant, TFolderGrantRecord } from "../models/folder-grant";
import { TFolderGrantCache } from "../services/dependencies";

// Grants are kept 10 min, served without a DB read for 10s after the last check, then re-checked by fingerprint.
const MARKER_TTL_SECONDS = 10;
const DATA_TTL_SECONDS = 600;

// Must be well above DATA_TTL_SECONDS: an expired row reads 0 and the next bump re-inserts at 1, so a short expiry
// can make a live cached fingerprint collide with the reset counter.
const FOLDER_VERSION_EXPIRY = "2d";

// folderVersion is a Postgres key_value_store row shared with the legacy permission service during rolling deploys.
// Bump the v1 in the keys when the cached shape changes so a deploy never reads an old one.
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
    // 0 checks the fingerprint on every read (tests use it so a change shows on the next request).
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
    return (await this.keyStore.getItem(FolderGrantKeys.marker(projectId, actor))) || null;
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
