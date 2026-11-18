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

// Behaves like ProjectStore over the projects a test adds. Sub-orgs are given by the root org id a project is added
// with.
export class InMemoryProjectStore implements TProjectStore {
  private readonly projects = new Map<string, TStoredProject>();

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
    return stored ? InMemoryProjectStore.toProject(stored) : null;
  }

  async findDeletionState(projectId: string): Promise<string> {
    return this.projects.get(projectId)?.deleteAfter?.toISOString() ?? "";
  }

  private static toProject({ deleteAfter: _deleteAfter, rootOrgId: _rootOrgId, ...record }: TStoredProject): Project {
    return Project.restore(record);
  }
}
