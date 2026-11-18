/* eslint-disable class-methods-use-this */
import { Project, TProjectRecord } from "../models/project";
import { TProjectsService } from "../services/projects/service";

// For tests of code that uses Projects: nothing counted, until a test sets a count or replaces a method.
export class FakeProjectsService implements TProjectsService {
  workspaces = 0;

  // Project id to its row; a project missing from it does not exist.
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
