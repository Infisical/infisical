import { randomUUID } from "node:crypto";

import { ProjectType } from "@app/db/schemas";

import { Project, TProjectRecord } from "../models/project";
import { TProjectStore } from "../services/dependencies";

const UNCOUNTED_WORKSPACE_TYPES: string[] = [
  ProjectType.CertificateManager,
  ProjectType.SecretScanning,
  ProjectType.PAM,
  ProjectType.AgentVault
];

type TStoredProject = TProjectRecord & { deleteAfter: Date | null; rootOrgId: string };

// Like ProjectStore over the projects a test adds. Sub-orgs come from the root org id passed when adding.
export class InMemoryProjectStore implements TProjectStore {
  private readonly projects = new Map<string, TStoredProject>();

  private readonly versions = new Map<string, number>();

  add(
    record: Partial<TProjectRecord> & Pick<TProjectRecord, "orgId">,
    { rootOrgId, deleteAfter = null }: { rootOrgId?: string; deleteAfter?: Date | null } = {}
  ): Project {
    const id = record.id ?? randomUUID();
    const stored: TStoredProject = {
      id,
      name: `project-${id}`,
      slug: `project-${id}`,
      type: ProjectType.SecretManager,
      enforceEncryptedSecretManagerSecretMetadata: false,
      ...record,
      deleteAfter,
      rootOrgId: rootOrgId ?? record.orgId
    };
    this.projects.set(id, stored);
    return InMemoryProjectStore.toProject(stored);
  }

  scheduleDeletion(projectId: string, deleteAfter: Date): void {
    const stored = this.projects.get(projectId);
    if (stored) this.projects.set(projectId, { ...stored, deleteAfter });
    this.versions.set(projectId, (this.versions.get(projectId) ?? 0) + 1);
  }

  async countWorkspaces(orgId: string): Promise<number> {
    return [...this.projects.values()].filter(
      (project) =>
        !project.deleteAfter &&
        !UNCOUNTED_WORKSPACE_TYPES.includes(project.type) &&
        (project.orgId === orgId || project.rootOrgId === orgId)
    ).length;
  }

  async findById(projectId: string): Promise<Project | null> {
    const stored = this.projects.get(projectId);
    return stored && !stored.deleteAfter ? InMemoryProjectStore.toProject(stored) : null;
  }

  // Counter stands in for updatedAt; every change through this store bumps it.
  async findVersion(projectId: string): Promise<string> {
    const stored = this.projects.get(projectId);
    if (!stored) return "missing";
    return `${this.versions.get(projectId) ?? 0}:${stored.deleteAfter?.toISOString() ?? ""}`;
  }

  private static toProject({ deleteAfter: _deleteAfter, rootOrgId: _rootOrgId, ...record }: TStoredProject): Project {
    return Project.restore(record);
  }
}
