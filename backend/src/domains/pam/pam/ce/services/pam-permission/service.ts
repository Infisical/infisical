import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, packRules } from "@casl/ability/extra";

import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError } from "@app/domains/lib/errors";
import { TTransaction } from "@app/domains/lib/transactions";
import {
  Membership,
  TActorGrantsService,
  TActorMembership,
  TGrantActor
} from "@app/domains/platform/access-control/ce/module";
import {
  ProjectResourcePermission,
  TProjectResourcePermissionService,
  TResourceRef
} from "@app/domains/platform/projects/ce/module";

import { PamAccountRoles, PamFolderRoles } from "../../models/pam-resource-roles";
import {
  PamResourcePermissionActions,
  PamResourcePermissionSet,
  PamResourcePermissionSub
} from "../../models/pam-roles";

// Every action in allOf, and at least one in anyOf, when given.
export type TPamActionFilter = {
  allOf?: PamResourcePermissionActions[];
  anyOf?: PamResourcePermissionActions[];
};

export type TPamResourceIds = { folderIds: string[]; accountIds: string[] };

export type TAccountAccessInput = {
  actor: TActorContext;
  projectId: string;
  accountId: string;
  folderId?: string | null;
  action: PamResourcePermissionActions;
};

export type TPamAccountRef = { id: string; folderId?: string | null };

type TPackedPamRules = PackRule<RawRuleOf<MongoAbility<PamResourcePermissionSet>>>[];

// Users and identities live in separate columns everywhere, so a key of the id alone would cross the two.
export const pamActorKey = ({ type, id }: TGrantActor) => `${type}:${id}`;

// What may read on a caller's transaction, so a re-check sees the membership changes it has not committed yet.
export type TPamPermissionTransaction = {
  // getResourceIdsWithActions for many actors at once, keyed by pamActorKey.
  getResourceIdsWithActionsForActors(input: {
    actors: TGrantActor[];
    projectId: string;
    actions: TPamActionFilter;
  }): Promise<Map<string, { folderIds: Set<string>; accountIds: Set<string> }>>;
};

export type TGetPamPermissionInput = {
  actor: TActorContext;
  projectId: string;
  folderId?: string | null;
  accountId?: string;
};

export type TPamPermissionService = {
  // What the actor may do on a PAM folder, an account, or an account in a folder: the roles it holds on either,
  // together. isProjectAdmin on the result is the product admin, who gets nothing on a resource it holds no role on.
  getPamPermission(input: TGetPamPermissionInput): Promise<ProjectResourcePermission<PamResourcePermissionSet>>;
  // Refuses unless the account's and its folder's roles together allow the action. A folder member the folder does
  // not allow it, holding no role on the account, is refused as a non-member of the account, as when the account was
  // checked on its own.
  assertAccountAccess(input: TAccountAccessInput): Promise<void>;
  // assertAccountAccess without the refusal, for deciding what a caller may do.
  canAccessAccount(input: TAccountAccessInput): Promise<boolean>;
  // The folders and accounts the actor holds an active role on, directly or through a group, that allows the
  // actions. A product admin gets none it holds no role on.
  getResourceIdsWithActions(input: {
    actor: TActorContext;
    projectId: string;
    actions: TPamActionFilter;
  }): Promise<TPamResourceIds>;
  getResourceIdsWithActionsForActors(input: {
    actors: TGrantActor[];
    projectId: string;
    actions: TPamActionFilter;
  }): Promise<Map<string, { folderIds: Set<string>; accountIds: Set<string> }>>;
  // How long the actor keeps LaunchSessions on the account through its roles on the account or its folder: null while
  // a granting role is permanent, 0 once none grants it.
  getLaunchAccessRemainingMs(input: {
    actor: TGrantActor;
    projectId: string;
    account: TPamAccountRef;
  }): Promise<number | null>;
  // Each account's packed rules from the actor's active roles on the account and on its folder, from one read, so a
  // list can show what the actor may do on every row.
  getAccountPermissionRules(input: {
    actor: TActorContext;
    projectId: string;
    accounts: TPamAccountRef[];
  }): Promise<Map<string, TPackedPamRules>>;
  within(tx: TTransaction): TPamPermissionTransaction;
};

const PAM_RESOURCE_TYPES = [ResourceType.PamFolder, ResourceType.PamAccount];

export class PamPermissionService implements TPamPermissionService {
  private readonly folderRoles = new PamFolderRoles();

  private readonly accountRoles = new PamAccountRoles();

  constructor(
    private readonly projectResourcePermissionService: TProjectResourcePermissionService,
    private readonly actorGrantsService: TActorGrantsService
  ) {}

  getPamPermission({
    actor,
    projectId,
    folderId,
    accountId
  }: TGetPamPermissionInput): Promise<ProjectResourcePermission<PamResourcePermissionSet>> {
    const resources: TResourceRef[] = [];
    if (folderId) resources.push({ resourceType: ResourceType.PamFolder, resourceId: folderId });
    if (accountId) resources.push({ resourceType: ResourceType.PamAccount, resourceId: accountId });
    return this.projectResourcePermissionService.getResourcePermission<PamResourcePermissionSet>({
      actor,
      projectId,
      type: ProjectType.PAM,
      resources,
      roles: accountId ? this.accountRoles : this.folderRoles
    });
  }

  async assertAccountAccess({ actor, projectId, accountId, folderId, action }: TAccountAccessInput): Promise<void> {
    const permission = await this.getPamPermission({ actor, projectId, folderId, accountId });
    const check = { action, subject: PamResourcePermissionSub.PamResource };
    const { memberships } = permission;
    if (
      folderId &&
      !permission.isProjectAdmin &&
      memberships.length > 0 &&
      memberships.every((membership) => membership.resourceId !== accountId) &&
      permission.cannot(check)
    ) {
      throw new PermissionDeniedError({ message: `You are not a member of this ${ResourceType.PamAccount}.` });
    }
    permission.assert(check);
  }

  async canAccessAccount(input: TAccountAccessInput): Promise<boolean> {
    try {
      await this.assertAccountAccess(input);
      return true;
    } catch (err) {
      if (err instanceof PermissionDeniedError) return false;
      throw err;
    }
  }

  async getResourceIdsWithActions({
    actor,
    projectId,
    actions
  }: {
    actor: TActorContext;
    projectId: string;
    actions: TPamActionFilter;
  }): Promise<TPamResourceIds> {
    const principal = PamPermissionService.grantActorOf(actor);
    const byActor = PamPermissionService.resourceIdsByActor(
      [principal],
      await this.actorGrantsService.listResourceMembershipsForActors({
        actors: [principal],
        projectId,
        resourceTypes: PAM_RESOURCE_TYPES
      }),
      actions,
      this.folderRoles
    );
    const resources = byActor.get(pamActorKey(principal))!;
    return { folderIds: [...resources.folderIds], accountIds: [...resources.accountIds] };
  }

  async getResourceIdsWithActionsForActors({
    actors,
    projectId,
    actions
  }: {
    actors: TGrantActor[];
    projectId: string;
    actions: TPamActionFilter;
  }) {
    const memberships = actors.length
      ? await this.actorGrantsService.listResourceMembershipsForActors({
          actors,
          projectId,
          resourceTypes: PAM_RESOURCE_TYPES
        })
      : [];
    return PamPermissionService.resourceIdsByActor(actors, memberships, actions, this.folderRoles);
  }

  async getLaunchAccessRemainingMs({
    actor,
    projectId,
    account
  }: {
    actor: TGrantActor;
    projectId: string;
    account: TPamAccountRef;
  }): Promise<number | null> {
    const memberships = (
      await this.actorGrantsService.listResourceMembershipsForActors({
        actors: [actor],
        projectId,
        resourceTypes: PAM_RESOURCE_TYPES
      })
    )
      .map(({ membership }) => membership)
      .filter(
        (membership) =>
          membership.isActive &&
          ((membership.resourceType === ResourceType.PamAccount && membership.resourceId === account.id) ||
            (Boolean(account.folderId) &&
              membership.resourceType === ResourceType.PamFolder &&
              membership.resourceId === account.folderId))
      );
    if (!memberships.length) return 0;

    const now = new Date();
    const grantingRoles = memberships
      .flatMap((membership) => membership.activeRoles(now))
      .filter((role) => this.folderRoles.allows(role.toGrant(), PamResourcePermissionActions.LaunchSessions));
    if (grantingRoles.some((role) => !role.isTemporary)) return null;

    const endsAt = Math.max(0, ...grantingRoles.map((role) => role.temporaryAccessEndTime?.getTime() ?? 0));
    return Math.max(0, endsAt - Date.now());
  }

  async getAccountPermissionRules({
    actor,
    projectId,
    accounts
  }: {
    actor: TActorContext;
    projectId: string;
    accounts: TPamAccountRef[];
  }): Promise<Map<string, TPackedPamRules>> {
    const rulesByAccountId = new Map<string, TPackedPamRules>();
    if (!accounts.length) return rulesByAccountId;

    const now = new Date();
    const memberships = (
      await this.actorGrantsService.listResourceMembershipsForActors({
        actors: [PamPermissionService.grantActorOf(actor)],
        projectId,
        resourceTypes: PAM_RESOURCE_TYPES
      })
    )
      .map(({ membership }) => membership)
      .filter((membership) => membership.isActive && membership.resourceId);
    const rulesOn = (resourceType: ResourceType, resourceId: string) => {
      const roles = resourceType === ResourceType.PamFolder ? this.folderRoles : this.accountRoles;
      return memberships
        .filter((membership) => membership.resourceType === resourceType && membership.resourceId === resourceId)
        .flatMap((membership) => membership.activeRoles(now))
        .flatMap((role) => roles.rulesOrNoneFor(role.toGrant()));
    };

    accounts.forEach((account) => {
      const rules = [
        ...(account.folderId ? rulesOn(ResourceType.PamFolder, account.folderId) : []),
        ...rulesOn(ResourceType.PamAccount, account.id)
      ];
      rulesByAccountId.set(account.id, packRules(rules as RawRuleOf<MongoAbility<PamResourcePermissionSet>>[]));
    });
    return rulesByAccountId;
  }

  within(tx: TTransaction): TPamPermissionTransaction {
    const grants = this.actorGrantsService.within(tx);
    return {
      getResourceIdsWithActionsForActors: async ({ actors, projectId, actions }) =>
        PamPermissionService.resourceIdsByActor(
          actors,
          actors.length
            ? await grants.listResourceMembershipsForActors({ actors, projectId, resourceTypes: PAM_RESOURCE_TYPES })
            : [],
          actions,
          this.folderRoles
        )
    };
  }

  // PAM is never reached through assumed privileges, so its resource roles are the principal's own.
  private static grantActorOf(actor: TActorContext): TGrantActor {
    return { type: actor.principal.type, id: actor.principal.id } as TGrantActor;
  }

  private static resourceIdsByActor(
    actors: TGrantActor[],
    memberships: TActorMembership[],
    actions: TPamActionFilter,
    roles: PamFolderRoles
  ) {
    const byActor = new Map<string, { folderIds: Set<string>; accountIds: Set<string> }>(
      actors.map((actor) => [pamActorKey(actor), { folderIds: new Set<string>(), accountIds: new Set<string>() }])
    );
    const now = new Date();
    const allows = (membership: Membership) =>
      membership.activeRoles(now).some((role) => {
        const grant = role.toGrant();
        if (actions.allOf && !actions.allOf.every((action) => roles.allows(grant, action))) return false;
        if (actions.anyOf && !actions.anyOf.some((action) => roles.allows(grant, action))) return false;
        return true;
      });
    memberships.forEach(({ actor, membership }) => {
      const resources = byActor.get(pamActorKey(actor));
      if (!resources || !membership.isActive || !membership.resourceId || !allows(membership)) return;
      if (membership.resourceType === ResourceType.PamFolder) resources.folderIds.add(membership.resourceId);
      else resources.accountIds.add(membership.resourceId);
    });
    return byActor;
  }
}
