/* eslint-disable class-methods-use-this */
import { Project, TProjectRecord } from "../models/project";
import { TProjectsService } from "../services/projects/service";

// Counts are 0 until a test sets one or replaces a method.
export class FakeProjectsService implements TProjectsService {
  workspaces = 0;

  // An id missing here means the project doesn't exist.
  readonly rows = new Map<string, TProjectRecord>();

  findProject: TProjectsService["findProject"] = async (projectId) => {
    const row = this.rows.get(projectId);
    return row ? Project.restore(row) : null;
  };

  countWorkspaces: TProjectsService["countWorkspaces"] = async () => this.workspaces;

  countProjectIdentities = async () => 0;

  countProjectIdentitiesByKind = async () => ({ users: 0, identities: 0 });

  getProjectIdentityBreakdown = async () => [];

  within = () => ({
    lockAndCountWorkspaces: (orgId: string) => this.countWorkspaces(orgId)
  });
}
