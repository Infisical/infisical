import type { TGrantActor } from "@app/domains/platform/access-control/ce/module";

import { Project, TProjectRecord } from "../models/project";
import { TProjectCache } from "../services/dependencies";

// Like ProjectCache with marker TTL 0: checks the fingerprint on every read, reloads only when it changed.
export class InMemoryProjectCache implements TProjectCache {
  private readonly entries = new Map<string, { fingerprint: string; record: TProjectRecord }>();

  loads = 0;

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
    const current = await fingerprint();
    const key = `${projectId}:${actor.type}:${actor.id}`;
    const cached = this.entries.get(key);
    if (cached && cached.fingerprint === current) return Project.restore(cached.record);
    this.loads += 1;
    const record = (await load()).toJSON();
    this.entries.set(key, { fingerprint: current, record });
    return Project.restore(record);
  }
}
