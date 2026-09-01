import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { TUserAliases, TUsers } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError, ForbiddenRequestError } from "@app/lib/errors";

import { adoptProvisionedShadowUser, resolveAliasUserIds, syncSsoUserProfile } from "./user-alias-fns";
import { UserAliasType } from "./user-alias-types";

vi.mock("@app/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

const alias = (externalId: string, userId: string) => ({ externalId, userId });

describe("resolveAliasUserIds", () => {
  test("resolves an identifier to the user its alias points at", () => {
    const { userIdByIdentifier, ambiguousIdentifiers } = resolveAliasUserIds({
      identifiers: ["m249913@one.example.com"],
      aliases: [alias("m249913@one.example.com", "user-1")]
    });

    expect(userIdByIdentifier.get("m249913@one.example.com")).toBe("user-1");
    expect(ambiguousIdentifiers).toEqual([]);
  });

  // externalId is case-sensitive (OIDC Core says so for `sub`), so a differently-cased identifier
  // is a different subject and must not resolve.
  test("does not match an identifier whose case differs from the stored externalId", () => {
    const { userIdByIdentifier, ambiguousIdentifiers } = resolveAliasUserIds({
      identifiers: ["m249913@one.example.com"],
      aliases: [alias("M249913@One.Example.com", "user-1")]
    });

    expect(userIdByIdentifier.size).toBe(0);
    expect(ambiguousIdentifiers).toEqual([]);
  });

  test("treats one user holding several aliases under the same externalId as one account", () => {
    const { userIdByIdentifier, ambiguousIdentifiers } = resolveAliasUserIds({
      identifiers: ["upn@example.com"],
      aliases: [alias("upn@example.com", "user-1"), alias("upn@example.com", "user-1")]
    });

    expect(userIdByIdentifier.get("upn@example.com")).toBe("user-1");
    expect(ambiguousIdentifiers).toEqual([]);
  });

  test("reports an identifier that reaches two distinct users as ambiguous and resolves it to nobody", () => {
    const { userIdByIdentifier, ambiguousIdentifiers } = resolveAliasUserIds({
      identifiers: ["upn@example.com"],
      aliases: [alias("upn@example.com", "user-1"), alias("upn@example.com", "user-2")]
    });

    expect(userIdByIdentifier.has("upn@example.com")).toBe(false);
    expect(ambiguousIdentifiers).toEqual(["upn@example.com"]);
  });

  // Counterpart to the test above: matching is exact, so case-variant aliases on two different
  // people are two different subjects, not an ambiguity.
  test("keeps case-variant aliases on different accounts distinct rather than ambiguous", () => {
    const { userIdByIdentifier, ambiguousIdentifiers } = resolveAliasUserIds({
      identifiers: ["upn@example.com"],
      aliases: [alias("UPN@Example.com", "user-1"), alias("upn@example.com", "user-2")]
    });

    expect(userIdByIdentifier.get("upn@example.com")).toBe("user-2");
    expect(ambiguousIdentifiers).toEqual([]);
  });

  test("leaves an identifier with no alias unresolved", () => {
    const { userIdByIdentifier, ambiguousIdentifiers } = resolveAliasUserIds({
      identifiers: ["nobody@example.com"],
      aliases: [alias("upn@example.com", "user-1")]
    });

    expect(userIdByIdentifier.size).toBe(0);
    expect(ambiguousIdentifiers).toEqual([]);
  });

  test("handles empty inputs", () => {
    expect(resolveAliasUserIds({ identifiers: [], aliases: [] })).toEqual({
      userIdByIdentifier: new Map(),
      ambiguousIdentifiers: []
    });
  });
});

const ORG_ID = "org-1";
const EXTERNAL_ID = "m249913@one.example.com";
const ASSERTED_EMAIL = "robert@example.com";

const shadowUser = (overrides: Partial<TUsers> = {}) =>
  ({
    id: "shadow-1",
    username: EXTERNAL_ID,
    email: EXTERNAL_ID,
    isGhost: false,
    isAccepted: false,
    isEmailVerified: false,
    hashedPassword: null,
    ...overrides
  }) as TUsers;

const OTHER_ORG_ID = "org-2";

const buildDeps = ({
  candidate = shadowUser(),
  existingAlias = null,
  membership = [{ id: "membership-1", scopeOrgId: ORG_ID, isActive: true }],
  orgs = []
}: {
  candidate?: TUsers | null;
  existingAlias?: object | null;
  membership?: object[];
  orgs?: object[];
} = {}) => {
  const userDAL = {
    findOne: vi.fn().mockResolvedValue(candidate),
    updateById: vi
      .fn()
      .mockImplementation((id: string, update: Partial<TUsers>) => ({ ...shadowUser(), ...update, id }))
  };
  const userAliasDAL = { findOne: vi.fn().mockResolvedValue(existingAlias) };
  const orgDAL = {
    findMembership: vi.fn().mockResolvedValue(membership),
    find: vi.fn().mockResolvedValue(orgs)
  };
  // A real tx aborts on the unique violation, so the update has to run inside a savepoint for the
  // recovery lookup (and the caller's remaining writes) to stay runnable. `transaction` off a tx is
  // knex's savepoint; the handle is distinct here so the tests can tell the two scopes apart.
  const savepoint = { savepoint: true };
  const tx = { transaction: vi.fn((cb: (sp: unknown) => unknown) => Promise.resolve(cb(savepoint))), savepoint };

  return { userDAL, userAliasDAL, orgDAL, tx, savepoint };
};

const adopt = (
  { tx, savepoint: _savepoint, ...deps }: ReturnType<typeof buildDeps>,
  externalId = EXTERNAL_ID,
  rootOrgId: string | null = null
) =>
  adoptProvisionedShadowUser({
    externalId,
    assertedEmail: ASSERTED_EMAIL,
    orgId: ORG_ID,
    rootOrgId,
    tx: tx as unknown as Knex,
    ...deps
  });

describe("adoptProvisionedShadowUser", () => {
  test("rewrites the placeholder's identity to the asserted mailbox", async () => {
    const deps = buildDeps();

    const adopted = await adopt(deps);

    expect(adopted?.user.id).toBe("shadow-1");
    expect(adopted?.adoptedFromUsername).toBe(EXTERNAL_ID);
    expect(deps.userDAL.updateById).toHaveBeenCalledWith(
      "shadow-1",
      { username: ASSERTED_EMAIL, email: ASSERTED_EMAIL },
      deps.savepoint
    );
  });

  // `sub` is case-sensitive, so this is a different subject from EXTERNAL_ID, not the same person
  // typed differently. Adopting on a folded match would hand it the other subject's access.
  test("declines an identifier that is not already canonical, rather than folding it onto a placeholder", async () => {
    const deps = buildDeps();

    expect(await adopt(deps, "M249913@One.Example.com")).toBeNull();
    expect(deps.userDAL.findOne).not.toHaveBeenCalled();
  });

  test("declines an identifier padded with whitespace, which sanitizing would otherwise trim into a match", async () => {
    const deps = buildDeps();

    expect(await adopt(deps, ` ${EXTERNAL_ID} `)).toBeNull();
    expect(deps.userDAL.findOne).not.toHaveBeenCalled();
  });

  test("declines when the identifier is already the asserted email", async () => {
    const deps = buildDeps();

    expect(await adopt(deps, ASSERTED_EMAIL)).toBeNull();
    expect(deps.userDAL.findOne).not.toHaveBeenCalled();
  });

  test("declines when no placeholder exists", async () => {
    const deps = buildDeps({ candidate: null });

    expect(await adopt(deps)).toBeNull();
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test.each([
    ["a ghost user", { isGhost: true }],
    ["an accepted account", { isAccepted: true }],
    ["an email-verified account", { isEmailVerified: true }],
    ["an account holding a password", { hashedPassword: "hash" }]
  ])("declines to adopt %s", async (_label, overrides) => {
    const deps = buildDeps({ candidate: shadowUser(overrides) });

    expect(await adopt(deps)).toBeNull();
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("declines when any IdP has already bound the account", async () => {
    const deps = buildDeps({ existingAlias: { id: "alias-1" } });

    expect(await adopt(deps)).toBeNull();
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("declines when the placeholder holds no membership in this org", async () => {
    const deps = buildDeps({ membership: [{ id: "membership-1", scopeOrgId: OTHER_ORG_ID }] });

    expect(await adopt(deps)).toBeNull();
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  // Username lookup is global, so another tenant that invited the same identifier shares this row.
  // Adopting it would hand this org's IdP subject that tenant's memberships and project access.
  test("declines when the placeholder also holds a membership in an unrelated org", async () => {
    const deps = buildDeps({
      membership: [
        { id: "membership-1", scopeOrgId: ORG_ID, isActive: true },
        { id: "membership-2", scopeOrgId: OTHER_ORG_ID }
      ],
      orgs: [{ id: OTHER_ORG_ID, rootOrgId: null }]
    });

    expect(await adopt(deps)).toBeNull();
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("adopts when the extra membership is a sub-org of this one, which is the same tenant", async () => {
    const deps = buildDeps({
      membership: [
        { id: "membership-1", scopeOrgId: ORG_ID, isActive: true },
        { id: "membership-2", scopeOrgId: OTHER_ORG_ID }
      ],
      orgs: [{ id: OTHER_ORG_ID, rootOrgId: ORG_ID }]
    });

    expect((await adopt(deps))?.user.username).toBe(ASSERTED_EMAIL);
  });

  // Declining is not neutral for a deactivated member: the caller reads null as "no placeholder"
  // and creates a second account with a fresh active membership, handing them the org back.
  test("fails the login when this org's placeholder has been deactivated", async () => {
    const deps = buildDeps({ membership: [{ id: "membership-1", scopeOrgId: ORG_ID, isActive: false }] });

    await expect(adopt(deps)).rejects.toThrow(ForbiddenRequestError);
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("fails the login for a deactivated placeholder even when adoption would be declined anyway", async () => {
    const deps = buildDeps({
      existingAlias: { id: "alias-1" },
      membership: [
        { id: "membership-1", scopeOrgId: ORG_ID, isActive: false },
        { id: "membership-2", scopeOrgId: OTHER_ORG_ID, isActive: true }
      ],
      orgs: [{ id: OTHER_ORG_ID, rootOrgId: null }]
    });

    await expect(adopt(deps)).rejects.toThrow(ForbiddenRequestError);
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("yields to the winner when a concurrent write takes the asserted email first", async () => {
    const deps = buildDeps();
    const winner = { ...shadowUser(), id: "winner-1", username: ASSERTED_EMAIL } as TUsers;
    deps.userDAL.updateById.mockRejectedValueOnce(
      new DatabaseError({ error: { code: DatabaseErrorCode.UniqueViolation } })
    );
    deps.userDAL.findOne.mockResolvedValueOnce(shadowUser()).mockResolvedValueOnce(winner);

    const yielded = await adopt(deps);

    expect(yielded?.user).toBe(winner);
    // Nothing was rewritten, so the caller must not record this as an adoption.
    expect(yielded?.adoptedFromUsername).toBeNull();
    // The write was scoped to the savepoint, and the recovery lookup runs outside it on the
    // caller's transaction. Reversed, the aborted transaction would fail the lookup with 25P02.
    expect(deps.tx.transaction).toHaveBeenCalledTimes(1);
    expect(deps.userDAL.updateById).toHaveBeenCalledWith(expect.anything(), expect.anything(), deps.savepoint);
    expect(deps.userDAL.findOne).toHaveBeenLastCalledWith({ username: ASSERTED_EMAIL }, deps.tx);
  });

  test("rethrows a unique violation that no concurrent write explains", async () => {
    const deps = buildDeps();
    deps.userDAL.updateById.mockRejectedValueOnce(
      new DatabaseError({ error: { code: DatabaseErrorCode.UniqueViolation } })
    );
    deps.userDAL.findOne.mockResolvedValueOnce(shadowUser()).mockResolvedValueOnce(null);

    await expect(adopt(deps)).rejects.toThrow(DatabaseError);
  });
});

const makeUser = (overrides: Partial<TUsers> = {}) =>
  ({
    id: "user-1",
    username: "old@example.com",
    email: "old@example.com",
    firstName: "Robert",
    lastName: "Smith",
    ...overrides
  }) as TUsers;

const makeAlias = (overrides: Partial<TUserAliases> = {}) =>
  ({
    id: "alias-1",
    userId: "user-1",
    orgId: "org-1",
    aliasType: UserAliasType.OIDC,
    externalId: "m249913@one.example.com",
    emails: ["old@example.com"],
    isEmailVerified: true,
    ...overrides
  }) as TUserAliases;

type TAuditLogArg = { orgId: string; event: { type: string; metadata: Record<string, unknown> } };

const makeDeps = ({
  conflictingUser = null as TUsers | null,
  updateError = null as Error | null,
  orgVerifiedDomains = ["example.com"] as string[]
} = {}) => {
  const updatedRows: Record<string, unknown>[] = [];
  const userDAL = {
    findOne: vi.fn().mockResolvedValue(conflictingUser),
    updateById: vi.fn().mockImplementation((id: string, update: Record<string, unknown>) => {
      if (updateError) throw updateError;
      updatedRows.push(update);
      return { ...makeUser(), ...update };
    }),
    transaction: vi.fn().mockImplementation((cb: (tx: unknown) => unknown) => cb({}))
  };
  const userAliasDAL = { updateById: vi.fn().mockResolvedValue(undefined) };
  const emailDomainDAL = {
    findOne: vi
      .fn()
      .mockImplementation(({ domain }: { domain: string }) =>
        orgVerifiedDomains.includes(domain) ? { id: "domain-1", domain } : undefined
      )
  };
  const auditLogService = {
    createAuditLog: vi.fn<(arg: TAuditLogArg) => Promise<void>>().mockResolvedValue(undefined)
  };

  return { userDAL, userAliasDAL, emailDomainDAL, auditLogService, updatedRows };
};

const sync = (args: Record<string, unknown>, deps: ReturnType<typeof makeDeps>) =>
  syncSsoUserProfile({
    user: makeUser(),
    userAlias: makeAlias(),
    assertedEmail: "old@example.com",
    orgId: "org-1",
    isAuthEnforced: true,
    userDAL: deps.userDAL,
    userAliasDAL: deps.userAliasDAL,
    emailDomainDAL: deps.emailDomainDAL,
    auditLogService: deps.auditLogService,
    ...args
  } as Parameters<typeof syncSsoUserProfile>[0]);

describe("syncSsoUserProfile", () => {
  test("does nothing when the org does not enforce SSO", async () => {
    const deps = makeDeps();
    const user = await sync({ assertedEmail: "new@example.com", isAuthEnforced: false }, deps);

    expect(user.username).toBe("old@example.com");
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
  });

  test("does nothing when the alias is not yet verified", async () => {
    const deps = makeDeps();
    const user = await sync(
      { assertedEmail: "new@example.com", userAlias: makeAlias({ isEmailVerified: false }) },
      deps
    );

    expect(user.username).toBe("old@example.com");
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("does not write when nothing differs", async () => {
    const deps = makeDeps();
    await sync({ assertedFirstName: "Robert", assertedLastName: "Smith" }, deps);

    expect(deps.userDAL.findOne).not.toHaveBeenCalled();
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("carries a renamed mailbox onto the account and the alias", async () => {
    const deps = makeDeps();
    const user = await sync({ assertedEmail: "new@example.com" }, deps);

    expect(user.username).toBe("new@example.com");
    expect(user.email).toBe("new@example.com");
    expect(deps.userAliasDAL.updateById).toHaveBeenCalledWith(
      "alias-1",
      { emails: ["old@example.com", "new@example.com"] },
      expect.anything()
    );
    const [audited] = deps.auditLogService.createAuditLog.mock.calls[0];
    expect(audited.event.type).toBe("sso-user-profile-synced");
    expect(audited.event.metadata.previousEmail).toBe("old@example.com");
    expect(audited.event.metadata.newEmail).toBe("new@example.com");
  });

  test("syncs a changed name without touching the email", async () => {
    const deps = makeDeps();
    const user = await sync({ assertedFirstName: "Bob", assertedLastName: "Smith" }, deps);

    expect(user.firstName).toBe("Bob");
    expect(deps.updatedRows[0]).toEqual({ firstName: "Bob" });
    expect(deps.userAliasDAL.updateById).not.toHaveBeenCalled();
  });

  test("does not blank out a name the assertion omits", async () => {
    const deps = makeDeps();
    await sync({ assertedFirstName: "", assertedLastName: undefined }, deps);

    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("skips the email but keeps the name when the address belongs to another account", async () => {
    const deps = makeDeps({ conflictingUser: { ...makeUser(), id: "user-2" } as TUsers });
    const user = await sync({ assertedEmail: "new@example.com", assertedFirstName: "Bob" }, deps);

    expect(user.username).toBe("old@example.com");
    expect(user.firstName).toBe("Bob");
    expect(deps.updatedRows[0]).toEqual({ firstName: "Bob" });
    const [audited] = deps.auditLogService.createAuditLog.mock.calls[0];
    expect(audited.event.type).toBe("sso-user-profile-sync-conflict");
    expect(audited.event.metadata.conflictingUserId).toBe("user-2");
  });

  test("leaves the account untouched when the conflicting account is the only change", async () => {
    const deps = makeDeps({ conflictingUser: { ...makeUser(), id: "user-2" } as TUsers });
    const user = await sync({ assertedEmail: "new@example.com" }, deps);

    expect(user.username).toBe("old@example.com");
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("never fails the login when the address is taken between the check and the write", async () => {
    const deps = makeDeps({
      updateError: new DatabaseError({ error: { code: DatabaseErrorCode.UniqueViolation } })
    });
    const user = await sync({ assertedEmail: "new@example.com" }, deps);

    expect(user.username).toBe("old@example.com");
    const [audited] = deps.auditLogService.createAuditLog.mock.calls[0];
    expect(audited.event.type).toBe("sso-user-profile-sync-conflict");
  });

  test("never fails the login on an unexpected database error", async () => {
    const deps = makeDeps({ updateError: new Error("connection reset") });
    const user = await sync({ assertedEmail: "new@example.com" }, deps);

    expect(user.username).toBe("old@example.com");
    expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
  });

  test("skips the email but keeps the name when the org does not own the address being replaced", async () => {
    const deps = makeDeps({ orgVerifiedDomains: ["new-corp.com"] });
    const user = await sync({ assertedEmail: "renamed@new-corp.com", assertedFirstName: "Bob" }, deps);

    expect(user.username).toBe("old@example.com");
    expect(user.firstName).toBe("Bob");
    expect(deps.updatedRows[0]).toEqual({ firstName: "Bob" });
  });

  test("skips the email when the org does not own the address being written", async () => {
    const deps = makeDeps({ orgVerifiedDomains: ["example.com"] });
    const user = await sync({ assertedEmail: "renamed@elsewhere.com" }, deps);

    expect(user.username).toBe("old@example.com");
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
    expect(deps.userDAL.findOne).not.toHaveBeenCalled();
  });
});
