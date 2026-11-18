import { Project, TProjectRecord } from "../models/project";
import { TProjectCache } from "../services/dependencies";

// Behaves like ProjectCache with its marker TTL at 0: the fingerprint is checked on every read, and the project is
// loaded again only when it changed.
export class InMemoryProjectCache implements TProjectCache {
  private readonly entries = new Map<string, { fingerprint: string; record: TProjectRecord }>();

  loads = 0;

  async getOrLoad({
    projectId,
    fingerprint,
    load
  }: {
    projectId: string;
    fingerprint: () => Promise<string>;
    load: () => Promise<Project>;
  }): Promise<Project> {
    const current = await fingerprint();
    const cached = this.entries.get(projectId);
    if (cached && cached.fingerprint === current) return Project.restore(cached.record);
    this.loads += 1;
    const record = (await load()).toJSON();
    this.entries.set(projectId, { fingerprint: current, record });
    return Project.restore(record);
  }
}
