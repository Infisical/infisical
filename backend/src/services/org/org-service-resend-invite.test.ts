import { createMongoAbility, MongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { OrgMembershipStatus } from "@app/db/schemas";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { NotFoundError, PermissionBoundaryError } from "@app/lib/errors";

import { orgServiceFactory } from "./org-service";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ isSmtpConfigured: false, SITE_URL: "https://infisical.test" })
}));

// Without SMTP the resend returns the invitation link to the caller, and that link alone completes the
// invitee's signup. So a caller who could not have granted the pending membership's role must not get one.

const ORG_ID = "org-id";
const MEMBERSHIP_ID = "membership-id";

const abilityByRole: Record<string, MongoAbility> = {
  admin: createMongoAbility<MongoAbility>(orgAdminPermissions),
  member: createMongoAbility<MongoAbility>(orgMemberPermissions)
};

const memberCreatorOnly = createMongoAbility<MongoAbility>([
  {
    action: [OrgPermissionMemberActions.Read, OrgPermissionMemberActions.Create],
    subject: OrgPermissionSubjects.Member
  }
]);

const memberCreatorGranter = createMongoAbility<MongoAbility>([
  {
    action: [
      OrgPermissionMemberActions.Read,
      OrgPermissionMemberActions.Create,
      OrgPermissionMemberActions.GrantPrivileges
    ],
    subject: OrgPermissionSubjects.Member
  }
]);

const setup = ({
  actorPermission,
  shouldUseNewPrivilegeSystem,
  inviteeRole = "admin",
  inviteeGroupRole,
  membershipExists = true
}: {
  actorPermission: MongoAbility;
  shouldUseNewPrivilegeSystem: boolean;
  inviteeRole?: string;
  inviteeGroupRole?: string;
  membershipExists?: boolean;
}) => {
  const createTokenForUser = vi.fn().mockResolvedValue("invite-token");
  const org = { id: ORG_ID, slug: "acme", name: "Acme", authEnforced: false, shouldUseNewPrivilegeSystem };

  const service = orgServiceFactory({
    permissionService: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: actorPermission }),
      getActorGrantAbilities: vi
        .fn()
        .mockResolvedValue(
          [inviteeRole, inviteeGroupRole]
            .filter((role): role is string => Boolean(role) && role !== "no-access")
            .map((role) => ({ permission: abilityByRole[role] }))
        )
    },
    userDAL: { findOne: vi.fn().mockResolvedValue({ id: "actor-id" }) },
    orgDAL: {
      findOrgById: vi.fn().mockResolvedValue(org),
      findById: vi.fn().mockResolvedValue(org),
      findMembership: vi.fn().mockResolvedValue(
        membershipExists
          ? [
              {
                id: MEMBERSHIP_ID,
                status: OrgMembershipStatus.Invited,
                email: "invitee@acme.test",
                actorUserId: "invitee-id"
              }
            ]
          : []
      )
    },
    tokenService: { createTokenForUser }
  } as never);

  const resend = () =>
    service.resendOrgMemberInvitation({
      orgId: ORG_ID,
      actorOrgId: ORG_ID,
      actorId: "actor-id",
      actor: "user",
      actorAuthMethod: "email",
      membershipId: MEMBERSHIP_ID
    } as never);

  return { resend, createTokenForUser };
};

describe("resendOrgMemberInvitation privilege boundary", () => {
  test.each([false, true])(
    "a member creator cannot get the link of a pending Admin invitation (new privilege system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { resend, createTokenForUser } = setup({ actorPermission: memberCreatorOnly, shouldUseNewPrivilegeSystem });

      await expect(resend()).rejects.toThrow(PermissionBoundaryError);
      expect(createTokenForUser).not.toHaveBeenCalled();
    }
  );

  test("on the new system, holding member:grant-privileges is enough", async () => {
    const { resend } = setup({ actorPermission: memberCreatorGranter, shouldUseNewPrivilegeSystem: true });

    const { signupToken } = await resend();
    expect(signupToken?.link).toContain("token=invite-token");
  });

  test("on the legacy system, an actor at least as privileged as the invitee gets the link", async () => {
    const { resend } = setup({ actorPermission: abilityByRole.admin, shouldUseNewPrivilegeSystem: false });

    const { signupToken } = await resend();
    expect(signupToken?.link).toContain("token=invite-token");
  });

  test("a No Access invitation needs no grant, as when it was created", async () => {
    const { resend } = setup({
      actorPermission: memberCreatorOnly,
      shouldUseNewPrivilegeSystem: true,
      inviteeRole: "no-access"
    });

    const { signupToken } = await resend();
    expect(signupToken?.link).toContain("token=invite-token");
  });

  test.each([false, true])(
    "a member creator cannot get the link of a No Access invitee who is pending in an Admin group (new privilege system: %s)",
    async (shouldUseNewPrivilegeSystem) => {
      const { resend, createTokenForUser } = setup({
        actorPermission: memberCreatorOnly,
        shouldUseNewPrivilegeSystem,
        inviteeRole: "no-access",
        inviteeGroupRole: "admin"
      });

      await expect(resend()).rejects.toThrow(PermissionBoundaryError);
      expect(createTokenForUser).not.toHaveBeenCalled();
    }
  );

  test("an unknown membership is a 404, not a crash", async () => {
    const { resend } = setup({
      actorPermission: abilityByRole.admin,
      shouldUseNewPrivilegeSystem: true,
      membershipExists: false
    });

    await expect(resend()).rejects.toThrow(NotFoundError);
  });
});
