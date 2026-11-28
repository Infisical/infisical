import { BlocklistEntryType, TBlocklistEntry } from "@app/domains/platform/license/ce/module";

import { Blocklist, BlockScope } from "./blocklist";

const NOW = new Date("2026-11-28T12:00:00Z");
const ROOT_ORG_ID = "6f1c6c2e-8d0a-4a7e-9a55-1d2f3b4c5d6e";
const SUB_ORG_ID = "0b6a7f2c-3e4d-4b5a-8c9d-0e1f2a3b4c5d";
const USER_ID = "9e8d7c6b-5a49-4382-a716-151413121110";

const entry = (type: BlocklistEntryType, value: string, overrides: Partial<TBlocklistEntry> = {}): TBlocklistEntry => ({
  id: `${type}:${value}`,
  type,
  value,
  message: null,
  expiresAt: null,
  ...overrides
});

const blocklistOf = (...entries: TBlocklistEntry[]) => Blocklist.restore({ entries });

describe("Blocklist.findBlock", () => {
  test.each([
    { name: "a blocked user id", entries: [entry(BlocklistEntryType.UserId, USER_ID)], email: "ada@acme.test" },
    { name: "a blocked email", entries: [entry(BlocklistEntryType.Email, "ada@acme.test")], email: "ada@acme.test" },
    {
      name: "an email in another case",
      entries: [entry(BlocklistEntryType.Email, "ada@acme.test")],
      email: "Ada@ACME.test"
    },
    { name: "a blocked domain", entries: [entry(BlocklistEntryType.EmailDomain, "acme.test")], email: "ada@acme.test" },
    {
      name: "a subdomain of a blocked domain",
      entries: [entry(BlocklistEntryType.EmailDomain, "acme.test")],
      email: "ada@eu.mail.acme.test"
    }
  ])("should block the user for $name", ({ entries, email }) => {
    // Action
    const match = blocklistOf(...entries).findBlock({ orgIds: [], userId: USER_ID, email }, NOW);

    // Assert
    expect(match?.scope).toBe(BlockScope.User);
  });

  test.each([
    { name: "a domain that only ends with the blocked one's name", email: "ada@notacme.test" },
    { name: "a domain that starts with the blocked one", email: "ada@acme.test.evil" },
    { name: "a different email", email: "bob@other.test" }
  ])("should not block $name", ({ email }) => {
    // Setup
    const blocklist = blocklistOf(
      entry(BlocklistEntryType.EmailDomain, "acme.test"),
      entry(BlocklistEntryType.Email, "ada@other.test")
    );

    // Action
    const match = blocklist.findBlock({ orgIds: [ROOT_ORG_ID], userId: USER_ID, email }, NOW);

    // Assert
    expect(match).toBeNull();
  });

  test("should block a sub-org when its root org is blocked, but not the root when only a sub-org is", () => {
    // Setup
    const rootBlocked = blocklistOf(entry(BlocklistEntryType.OrgId, ROOT_ORG_ID));
    const subBlocked = blocklistOf(entry(BlocklistEntryType.OrgId, SUB_ORG_ID));

    // Action
    const subOfBlockedRoot = rootBlocked.findBlock({ orgIds: [SUB_ORG_ID, ROOT_ORG_ID] }, NOW);
    const rootOfBlockedSub = subBlocked.findBlock({ orgIds: [ROOT_ORG_ID, ROOT_ORG_ID] }, NOW);

    // Assert
    expect(subOfBlockedRoot?.scope).toBe(BlockScope.Organization);
    expect(rootOfBlockedSub).toBeNull();
  });

  test("should report the user block when both the user and the org are blocked", () => {
    // Setup
    const blocklist = blocklistOf(
      entry(BlocklistEntryType.OrgId, ROOT_ORG_ID, { message: "org reason" }),
      entry(BlocklistEntryType.UserId, USER_ID, { message: "user reason" })
    );

    // Action
    const match = blocklist.findBlock({ orgIds: [ROOT_ORG_ID], userId: USER_ID }, NOW);

    // Assert
    expect(match).toEqual({ scope: BlockScope.User, message: "user reason" });
  });

  test("should ignore an entry once it has expired", () => {
    // Setup
    const blocklist = blocklistOf(
      entry(BlocklistEntryType.OrgId, ROOT_ORG_ID, { expiresAt: new Date("2026-11-28T11:59:59Z") })
    );

    // Action
    const match = blocklist.findBlock({ orgIds: [ROOT_ORG_ID] }, NOW);

    // Assert
    expect(match).toBeNull();
  });

  test.each([
    { scope: BlockScope.User, message: null, expected: /restricted for this account/ },
    { scope: BlockScope.User, message: "  ", expected: /restricted for this account/ },
    { scope: BlockScope.Organization, message: null, expected: /restricted\. Contact support/ },
    { scope: BlockScope.Organization, message: "Unpaid invoices", expected: /^Unpaid invoices$/ }
  ])("should show $expected for a $scope block with message $message", ({ scope, message, expected }) => {
    // Setup
    const blocklist = blocklistOf(
      scope === BlockScope.User
        ? entry(BlocklistEntryType.UserId, USER_ID, { message })
        : entry(BlocklistEntryType.OrgId, ROOT_ORG_ID, { message })
    );

    // Action
    const match = blocklist.findBlock({ orgIds: [ROOT_ORG_ID], userId: USER_ID }, NOW);

    // Assert
    expect(match?.message).toMatch(expected);
  });
});
