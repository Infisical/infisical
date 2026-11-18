import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";

import { Project, TProjectRecord } from "../models/project";
import { TProjectCache } from "../services/dependencies";

// Kept ten minutes and served without a database read for ten seconds after it was last checked, then checked again
// against the project's deletion state, so a soft-deleted project is noticed within seconds.
const MARKER_TTL_SECONDS = 10;
const DATA_TTL_SECONDS = 600;

// Bump the version when the cached shape changes, so a deploy never reads an older one.
const ProjectKeys = {
  data: (projectId: string) => `projects:project:v1:data:${projectId}`,
  marker: (projectId: string) => `projects:project:v1:marker:${projectId}`
};

export class ProjectCache implements TProjectCache {
  constructor(
    private readonly keyStore: TDomainKeyStore,
    // 0 checks the fingerprint on every read: what tests use, so a change shows on the next request.
    private readonly markerTtlSeconds: number = MARKER_TTL_SECONDS
  ) {}

  async getOrLoad({
    projectId,
    fingerprint,
    load
  }: {
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<Project>;
  }): Promise<Project> {
    const record = await withCacheFingerprint<TProjectRecord>({
      keyStore: this.keyStore,
      dataKey: ProjectKeys.data(projectId),
      markerKey: ProjectKeys.marker(projectId),
      markerTtlSeconds: this.markerTtlSeconds,
      dataTtlSeconds: DATA_TTL_SECONDS,
      fingerprintFetcher: fingerprint,
      dataFetcher: async () => (await load()).toJSON()
    });
    return Project.restore(record);
  }
}
