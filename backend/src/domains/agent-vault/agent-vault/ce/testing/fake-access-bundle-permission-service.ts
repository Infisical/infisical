import { ProjectType } from "@app/db/schemas";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { ActorGrants, RuleIdentity, RuleSet, TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { Project, ProjectPermission, TProjectRule } from "@app/domains/platform/projects/ce/module";

import {
  TAccessBundlePermissionService,
  TAgentVaultGrantedReachability,
  TAgentVaultPermission,
  TAgentVaultReachability,
  TGetAccessBundlePermissionInput
} from "../services/dependencies";

type TFakeAccess = { rules: TProjectRule[]; reachesEveryBundle: boolean; grantedAccessBundleIds: string[] };

// An actor with nothing set is refused as a non-member.
export class FakeAccessBundlePermissionService implements TAccessBundlePermissionService {
  private readonly access = new Map<string, TFakeAccess>();

  allow({
    actorId,
    projectId,
    rules,
    reachesEveryBundle = false,
    grantedAccessBundleIds = []
  }: {
    actorId: string;
    projectId: string;
    rules: TProjectRule[];
    reachesEveryBundle?: boolean;
    grantedAccessBundleIds?: string[];
  }): this {
    this.access.set(`${actorId}:${projectId}`, { rules, reachesEveryBundle, grantedAccessBundleIds });
    return this;
  }

  async getAgentVaultPermission(input: TGetAccessBundlePermissionInput): Promise<TAgentVaultPermission> {
    return { permission: this.find(input).permission };
  }

  async getAccessBundlePermission(input: TGetAccessBundlePermissionInput): Promise<TAgentVaultReachability> {
    const { permission, reachesEveryBundle, grantedAccessBundleIds } = this.find(input);
    return { permission, reachesEveryBundle, accessBundleIds: reachesEveryBundle ? null : grantedAccessBundleIds };
  }

  async getGrantedAccessBundlePermission(
    input: TGetAccessBundlePermissionInput
  ): Promise<TAgentVaultGrantedReachability> {
    const { permission, reachesEveryBundle, grantedAccessBundleIds } = this.find(input);
    return {
      permission,
      reachesEveryBundle,
      accessBundleIds: reachesEveryBundle ? null : grantedAccessBundleIds,
      grantedAccessBundleIds
    };
  }

  async findReachableAccessBundleIds({ projectId, actor }: { projectId: string; actor: TGrantActor }) {
    return this.access.get(`${actor.id}:${projectId}`)?.grantedAccessBundleIds ?? [];
  }

  // eslint-disable-next-line class-methods-use-this
  intersectAccessBundleIds(a: string[] | null, b: string[] | null): string[] | null {
    if (a === null) return b;
    if (b === null) return a;
    return a.filter((id) => b.includes(id));
  }

  private find({ actor, projectId }: TGetAccessBundlePermissionInput) {
    const access = this.access.get(`${actor.principal.id}:${projectId}`);
    if (!access) {
      throw new PermissionDeniedError({
        name: "ProjectMembershipNotFound",
        message: `You are not a member of this project with ID ${projectId}.`
      });
    }
    const permission = ProjectPermission.build({
      rules: RuleSet.of(access.rules),
      project: Project.restore({
        id: projectId,
        name: projectId,
        slug: projectId,
        orgId: actor.org.id,
        type: ProjectType.AgentVault
      }),
      grants: ActorGrants.empty(),
      principal: actor.principal,
      identity: RuleIdentity.create({ id: actor.principal.id, username: "", metadata: {} }),
      usesNewPrivilegeSystem: actor.org.shouldUseNewPrivilegeSystem
    });
    return { ...access, permission };
  }
}
