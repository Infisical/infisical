import { TDomainKeyStore } from "@app/domains/lib/key-store";
import type { TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";

import { Project, TProjectRecord } from "../models/project";
import { TProjectCache } from "../services/dependencies";

// Kept per actor for ten minutes and served without a database read for ten seconds after it was last checked, then
// checked again against the project's version, so a change or a soft deletion is noticed within seconds.
const MARKER_TTL_SECONDS = 10;
const DATA_TTL_SECONDS = 600;

// Bump the version when the cached shape changes, so a deploy never reads an older one.
const ProjectKeys = {
  data: (projectId: string, actor: TGrantActor) => `projects:project:v2:data:${projectId}:${actor.type}:${actor.id}`,
  marker: (projectId: string, actor: TGrantActor) =>
    `projects:project:v2:marker:${projectId}:${actor.type}:${actor.id}`
};

export class ProjectCache implements TProjectCache {
  constructor(
    private readonly keyStore: TDomainKeyStore,
    // 0 checks the fingerprint on every read: what tests use, so a change shows on the next request.
    private readonly markerTtlSeconds: number = MARKER_TTL_SECONDS
  ) {}

  async getOrLoad({
    projectId,
    actor,
    fingerprint,
    load
  }: {
    projectId: string;
    actor: TGrantActor;
    fingerprint: () => Promise<string>;
    load: () => Promise<Project>;
  }): Promise<Project> {
    const record = await withCacheFingerprint<TProjectRecord>({
      keyStore: this.keyStore,
      dataKey: ProjectKeys.data(projectId, actor),
      markerKey: ProjectKeys.marker(projectId, actor),
      markerTtlSeconds: this.markerTtlSeconds,
      dataTtlSeconds: DATA_TTL_SECONDS,
      fingerprintFetcher: fingerprint,
      dataFetcher: async () => (await load()).toJSON()
    });
    return Project.restore(record);
  }
}
