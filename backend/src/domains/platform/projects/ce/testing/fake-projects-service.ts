/* eslint-disable class-methods-use-this */
import { TProjectsService } from "../services/projects/service";

// For tests of code that uses Projects: nothing counted, until a test sets a count or replaces a method.
export class FakeProjectsService implements TProjectsService {
  workspaces = 0;

  countWorkspaces: TProjectsService["countWorkspaces"] = async () => this.workspaces;

  countProjectIdentities = async () => 0;

  countProjectIdentitiesByKind = async () => ({ users: 0, identities: 0 });

  getProjectIdentityBreakdown = async () => [];

  within = () => ({
    lockAndCountWorkspaces: (orgId: string) => this.countWorkspaces(orgId)
  });
}
