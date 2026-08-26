import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { TUsers } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { DatabaseError } from "@app/lib/errors";

import { adoptProvisionedShadowUser, resolveAliasUserIds } from "./user-alias-fns";

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

const buildDeps = ({
  candidate = shadowUser(),
  existingAlias = null,
  membership = [{ id: "membership-1" }]
}: {
  candidate?: TUsers | null;
  existingAlias?: object | null;
  membership?: object[];
} = {}) => {
  const userDAL = {
    findOne: vi.fn().mockResolvedValue(candidate),
    updateById: vi
      .fn()
      .mockImplementation((id: string, update: Partial<TUsers>) => ({ ...shadowUser(), ...update, id }))
  };
  const userAliasDAL = { findOne: vi.fn().mockResolvedValue(existingAlias) };
  const orgDAL = { findMembership: vi.fn().mockResolvedValue(membership) };
  // A real tx aborts on the unique violation, so the update has to run inside a savepoint for the
  // recovery lookup (and the caller's remaining writes) to stay runnable. `transaction` off a tx is
  // knex's savepoint; the handle is distinct here so the tests can tell the two scopes apart.
  const savepoint = { savepoint: true };
  const tx = { transaction: vi.fn((cb: (sp: unknown) => unknown) => Promise.resolve(cb(savepoint))), savepoint };

  return { userDAL, userAliasDAL, orgDAL, tx, savepoint };
};

const adopt = ({ tx, savepoint: _savepoint, ...deps }: ReturnType<typeof buildDeps>, externalId = EXTERNAL_ID) =>
  adoptProvisionedShadowUser({
    externalId,
    assertedEmail: ASSERTED_EMAIL,
    orgId: ORG_ID,
    tx: tx as unknown as Knex,
    ...deps
  });

describe("adoptProvisionedShadowUser", () => {
  test("rewrites the placeholder's identity to the asserted mailbox", async () => {
    const deps = buildDeps();

    const adopted = await adopt(deps);

    expect(adopted?.id).toBe("shadow-1");
    expect(deps.userDAL.updateById).toHaveBeenCalledWith(
      "shadow-1",
      { username: ASSERTED_EMAIL, email: ASSERTED_EMAIL },
      deps.savepoint
    );
  });

  test("looks the placeholder up by the sanitized identifier, so a mixed-case claim still matches", async () => {
    const deps = buildDeps();

    await adopt(deps, "M249913@One.Example.com");

    expect(deps.userDAL.findOne).toHaveBeenCalledWith({ username: EXTERNAL_ID }, deps.tx);
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
    const deps = buildDeps({ membership: [] });

    expect(await adopt(deps)).toBeNull();
    expect(deps.userDAL.updateById).not.toHaveBeenCalled();
  });

  test("yields to the winner when a concurrent write takes the asserted email first", async () => {
    const deps = buildDeps();
    const winner = { ...shadowUser(), id: "winner-1", username: ASSERTED_EMAIL } as TUsers;
    deps.userDAL.updateById.mockRejectedValueOnce(
      new DatabaseError({ error: { code: DatabaseErrorCode.UniqueViolation } })
    );
    deps.userDAL.findOne.mockResolvedValueOnce(shadowUser()).mockResolvedValueOnce(winner);

    expect(await adopt(deps)).toBe(winner);
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
