import { describe, expect, test, vi } from "vitest";

import { AccessScope } from "@app/db/schemas";
import { ActorType } from "@app/services/auth/auth-type";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { PamProductRole } from "../pam/pam-enums";
import { pamMembershipServiceFactory } from "./pam-membership-service";

const ORG_ID = "org-1";
const PROJECT_ID = "project-1";
const IDENTIFIER = "m249913@one.example.com";

const ctx = {
  actor: ActorType.USER,
  actorId: "actor-1",
  actorOrgId: ORG_ID,
  actorAuthMethod: undefined
} as unknown as Parameters<ReturnType<typeof pamMembershipServiceFactory>["addProductUserMembers"]>[0];

const user = (id: string, username: string) => ({ id, username, isGhost: false });

// Only the collaborators addProductUserMembers touches on the add path; everything else is left
// undefined so an unexpected reach shows up as a crash rather than a silent pass.
const buildService = ({
  usersByUsername = [] as ReturnType<typeof user>[],
  aliases = [] as { externalId: string; userId: string }[],
  orgMemberUserIds = [] as string[]
} = {}) => {
  const created: { actorUserId: string; role: string }[] = [];
  const deps = {
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({ hasRole: () => true }) },
    userDAL: {
      find: vi.fn(({ $in }: { $in: { username?: string[]; id?: string[] } }) => {
        if ($in.username) return Promise.resolve(usersByUsername.filter((u) => $in.username!.includes(u.username)));
        return Promise.resolve(usersByUsername.filter((u) => $in.id!.includes(u.id)));
      })
    },
    userAliasDAL: {
      findBySsoExternalIds: vi.fn(
        ({ externalIds }: { externalIds: string[]; orgIds: string[]; aliasTypes: string[] }) =>
          Promise.resolve(aliases.filter((a) => externalIds.includes(a.externalId)))
      )
    },
    orgDAL: { findById: vi.fn().mockResolvedValue({ id: ORG_ID, rootOrgId: null }) },
    membershipDAL: {
      find: vi.fn(({ scope }: { scope: string }) =>
        Promise.resolve(scope === AccessScope.Organization ? orgMemberUserIds.map((id) => ({ actorUserId: id })) : [])
      ),
      transaction: vi.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb({}))),
      create: vi.fn(({ actorUserId }: { actorUserId: string }) =>
        Promise.resolve({ id: `mem-${actorUserId}`, actorUserId, createdAt: new Date() })
      )
    },
    membershipRoleDAL: {
      create: vi.fn(({ role }: { role: string }) => {
        created.push({ actorUserId: "", role });
        return Promise.resolve({ role });
      })
    },
    projectAccessRequestDAL: { delete: vi.fn().mockResolvedValue(undefined) },
    usageMeteringService: { emitForProject: vi.fn() }
  };

  const service = pamMembershipServiceFactory(deps as unknown as Parameters<typeof pamMembershipServiceFactory>[0]);
  return { service, deps };
};

const add = (service: ReturnType<typeof buildService>["service"], emails: string[]) =>
  service.addProductUserMembers({
    ...ctx,
    projectId: PROJECT_ID,
    userIds: [],
    emails,
    role: PamProductRole.Member
  });

describe("pamMembership addProductUserMembers", () => {
  // The invite this call accompanies resolves IdP identifiers through SSO aliases, so PAM has to
  // as well; otherwise it rejects the very user the org invite just added.
  test("attaches a member named by an IdP identifier that only their SSO alias carries", async () => {
    const member = user("user-1", "robert@example.com");
    const { service, deps } = buildService({
      usersByUsername: [member],
      aliases: [{ externalId: IDENTIFIER, userId: member.id }],
      orgMemberUserIds: [member.id]
    });

    const { memberships } = await add(service, [IDENTIFIER]);

    expect(memberships).toHaveLength(1);
    expect(memberships[0].userId).toBe(member.id);
    // The scoping arguments are the security boundary, so assert them rather than just the outcome.
    const [[lookup]] = deps.userAliasDAL.findBySsoExternalIds.mock.calls;
    expect(lookup.externalIds).toEqual([IDENTIFIER]);
    expect(lookup.orgIds).toEqual([ORG_ID]);
    expect(lookup.aliasTypes).toContain(UserAliasType.OIDC);
  });

  test("names the same person by both email and identifier without attaching them twice", async () => {
    const member = user("user-1", "robert@example.com");
    const { service } = buildService({
      usersByUsername: [member],
      aliases: [{ externalId: IDENTIFIER, userId: member.id }],
      orgMemberUserIds: [member.id]
    });

    const { memberships } = await add(service, [member.username, IDENTIFIER]);

    expect(memberships).toHaveLength(1);
  });

  test("refuses an identifier that reaches two accounts rather than guessing", async () => {
    const one = user("user-1", "one@example.com");
    const two = user("user-2", "two@example.com");
    const { service } = buildService({
      usersByUsername: [one, two],
      aliases: [
        { externalId: IDENTIFIER, userId: one.id },
        { externalId: IDENTIFIER, userId: two.id }
      ],
      orgMemberUserIds: [one.id, two.id]
    });

    await expect(add(service, [IDENTIFIER])).rejects.toThrow(/match more than one SSO account/);
  });

  test("still rejects an identifier nothing resolves, naming what the caller sent", async () => {
    const { service } = buildService();

    await expect(add(service, [IDENTIFIER])).rejects.toThrow(new RegExp(`'${IDENTIFIER}'`));
  });
});
