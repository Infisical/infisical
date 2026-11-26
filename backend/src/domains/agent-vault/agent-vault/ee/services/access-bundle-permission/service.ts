import { ProjectMembershipRole, ProjectType, ResourceType } from "@app/db/schemas";
import { Membership, TActorGrantsService, TGrantActor } from "@app/domains/platform/access-control/ce/module";
import { ProjectPermission, TProjectPermissionService } from "@app/domains/platform/projects/ce/module";
import { ActorType } from "@app/lib/auth/actor-types";

import {
  TAccessBundlePermissionService,
  TAgentVaultGrantedReachability,
  TAgentVaultPermission,
  TAgentVaultReachability,
  TGetAccessBundlePermissionInput
} from "../../../ce/services/dependencies";

// Reaching every bundle comes with the role, not a permission. Keep in sync with
// AGENT_VAULT_ROLES_REACHING_EVERY_BUNDLE in ee/services/agent-vault, which the queries that lock or keep those role
// rows read.
const ROLES_REACHING_EVERY_BUNDLE: readonly string[] = [ProjectMembershipRole.Admin];

export class AccessBundlePermissionService implements TAccessBundlePermissionService {
  constructor(
    private readonly projectPermissionService: TProjectPermissionService,
    private readonly actorGrantsService: TActorGrantsService
  ) {}

  async getAgentVaultPermission(input: TGetAccessBundlePermissionInput): Promise<TAgentVaultPermission> {
    const { permission } = await this.load(input);
    return { permission };
  }

  async getAccessBundlePermission({
    actor,
    projectId
  }: TGetAccessBundlePermissionInput): Promise<TAgentVaultReachability> {
    const { permission, reachesEveryBundle } = await this.load({ actor, projectId });
    if (reachesEveryBundle) return { reachesEveryBundle, accessBundleIds: null, permission };

    const { principal } = actor;
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      return { reachesEveryBundle: false, accessBundleIds: [], permission };
    }

    const accessBundleIds = await this.findReachableAccessBundleIds({
      projectId,
      actor: { type: principal.type, id: principal.id },
      groupIds: AccessBundlePermissionService.liveGroupIdsFrom(permission.memberships)
    });
    return { reachesEveryBundle: false, accessBundleIds, permission };
  }

  async getGrantedAccessBundlePermission({
    actor,
    projectId
  }: TGetAccessBundlePermissionInput): Promise<TAgentVaultGrantedReachability> {
    const { permission, reachesEveryBundle } = await this.load({ actor, projectId });
    const { principal } = actor;
    if (principal.type !== ActorType.USER && principal.type !== ActorType.IDENTITY) {
      return {
        reachesEveryBundle,
        accessBundleIds: reachesEveryBundle ? null : [],
        grantedAccessBundleIds: [],
        permission
      };
    }

    const grantedAccessBundleIds = await this.findReachableAccessBundleIds({
      projectId,
      actor: { type: principal.type, id: principal.id },
      groupIds: AccessBundlePermissionService.liveGroupIdsFrom(permission.memberships)
    });
    return {
      reachesEveryBundle,
      accessBundleIds: reachesEveryBundle ? null : grantedAccessBundleIds,
      grantedAccessBundleIds,
      permission
    };
  }

  async findReachableAccessBundleIds({
    projectId,
    actor,
    groupIds
  }: {
    projectId: string;
    actor: TGrantActor;
    groupIds: string[];
  }): Promise<string[]> {
    const memberships = await this.actorGrantsService.listResourceMemberships({
      actor,
      projectId,
      resourceType: ResourceType.AgentVaultAccessBundle
    });
    const liveGroups = new Set(groupIds);
    const reachable = memberships.filter((membership) => {
      if (!membership.isActive) return false;
      if (membership.viaGroupId) return liveGroups.has(membership.viaGroupId);
      return true;
    });
    return [...new Set(reachable.map((membership) => membership.resourceId as string))];
  }

  // eslint-disable-next-line class-methods-use-this
  intersectAccessBundleIds(a: string[] | null, b: string[] | null): string[] | null {
    if (a === null) return b;
    if (b === null) return a;
    const inB = new Set(b);
    return a.filter((id) => inB.has(id));
  }

  private async load({ actor, projectId }: TGetAccessBundlePermissionInput) {
    const permission = await this.projectPermissionService.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.AgentVault
    });
    return { permission, reachesEveryBundle: AccessBundlePermissionService.reachesEveryBundle(permission) };
  }

  // Matches any role with the slug, custom ones too, same as legacy hasRole.
  private static reachesEveryBundle(permission: ProjectPermission): boolean {
    return ROLES_REACHING_EVERY_BUNDLE.some((slug) => permission.hasRole({ slug }));
  }

  // A group's grants count only while the group confers a live Agent Vault role.
  private static liveGroupIdsFrom(memberships: Membership[]): string[] {
    return memberships
      .filter((membership) => membership.viaGroupId && membership.activeRoles().length > 0)
      .map((membership) => membership.viaGroupId as string);
  }
}
