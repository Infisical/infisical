import { TAgentVaultServices } from "@app/db/schemas";

import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";
import { TAgentVaultCredentialUpdate } from "./agent-vault-access-bundle-types";
import {
  isStoredSecretReplaced,
  mergeCredential,
  needsStoredSecretFor,
  splitCredential
} from "./agent-vault-credential-write-fns";

const VALUE = "credential-value";
const USERNAME = "credential-username";

const BEARER = AgentVaultCredentialType.Bearer;
const BASIC = AgentVaultCredentialType.Basic;
const PASSTHROUGH = AgentVaultCredentialType.Passthrough;

// Only the columns the helpers read. A sealed secret is any non-empty buffer: the helpers check for one, not its contents.
const storedService = ({
  type,
  memberProvidedFields = null,
  sealed = true
}: {
  type: AgentVaultCredentialType;
  memberProvidedFields?: string[] | null;
  sealed?: boolean;
}) =>
  ({
    credentialType: type,
    credentialConfig: type === BEARER ? { type, headerName: "Authorization", headerPrefix: "Bearer " } : { type },
    memberProvidedFields,
    encryptedCredential: sealed ? Buffer.from("sealed") : null
  }) as unknown as TAgentVaultServices;

const credential = (value: Record<string, unknown>) => value as unknown as TAgentVaultCredentialUpdate;

describe("splitCredential", () => {
  test.each([
    ["bearer with a token", { type: BEARER, value: "t" }, { value: "t" }, null],
    ["bearer left to members", { type: BEARER, memberProvidedFields: [VALUE] }, null, [VALUE]],
    ["basic with both halves", { type: BASIC, username: "u", password: "p" }, { username: "u", password: "p" }, null],
    ["basic with a username only", { type: BASIC, username: "u" }, { username: "u", password: "" }, null],
    [
      "basic with the password left to members",
      { type: BASIC, username: "u", memberProvidedFields: [VALUE] },
      { username: "u" },
      [VALUE]
    ],
    ["basic left wholly to members", { type: BASIC, memberProvidedFields: [USERNAME, VALUE] }, null, [USERNAME, VALUE]],
    ["passthrough", { type: PASSTHROUGH }, null, null]
  ])("%s", (_, input, secret, memberProvidedFields) => {
    const written = splitCredential(credential(input));
    expect(written.secret).toEqual(secret);
    expect(written.memberProvidedFields).toEqual(memberProvidedFields);
  });

  test.each([
    ["bearer with no token and nothing left to members", { type: BEARER }, "needs a token"],
    ["basic with neither half", { type: BASIC }, "needs a username, a password, or both"]
  ])("refuses %s", (_, input, message) => {
    expect(() => splitCredential(credential(input))).toThrow(message);
  });
});

describe("mergeCredential", () => {
  const STORED_BASIC = { username: "stored-u", password: "stored-p" };

  test.each([
    // [case, stored service, update, sealed secret read for it, expected secret, expected member fields]
    ["bearer token rotated", { type: BEARER }, { type: BEARER, value: "new" }, null, { value: "new" }, null],
    ["bearer header renamed only", { type: BEARER }, { type: BEARER, headerName: "X-Key" }, null, undefined, null],
    [
      "bearer token handed to members",
      { type: BEARER },
      { type: BEARER, memberProvidedFields: [VALUE] },
      null,
      null,
      [VALUE]
    ],
    [
      "bearer still member provided, list left out",
      { type: BEARER, memberProvidedFields: [VALUE], sealed: false },
      { type: BEARER, headerName: "X-Key" },
      null,
      undefined,
      [VALUE]
    ],
    [
      "bearer taken back with a token",
      { type: BEARER, memberProvidedFields: [VALUE], sealed: false },
      { type: BEARER, memberProvidedFields: [], value: "admin" },
      null,
      { value: "admin" },
      null
    ],
    [
      "basic password rotated",
      { type: BASIC },
      { type: BASIC, password: "new-p" },
      STORED_BASIC,
      { username: "stored-u", password: "new-p" },
      null
    ],
    [
      "basic password handed to members",
      { type: BASIC },
      { type: BASIC, memberProvidedFields: [VALUE] },
      STORED_BASIC,
      { username: "stored-u" },
      [VALUE]
    ],
    [
      "basic password taken back with a value",
      { type: BASIC, memberProvidedFields: [VALUE] },
      { type: BASIC, memberProvidedFields: [], password: "admin-p" },
      { username: "stored-u" },
      { username: "stored-u", password: "admin-p" },
      null
    ],
    [
      "basic password taken back without one starts it empty",
      { type: BASIC, memberProvidedFields: [VALUE] },
      { type: BASIC, memberProvidedFields: [] },
      { username: "stored-u" },
      { username: "stored-u", password: "" },
      null
    ],
    [
      "basic username taken back from a fully member-provided credential",
      { type: BASIC, memberProvidedFields: [USERNAME, VALUE], sealed: false },
      { type: BASIC, memberProvidedFields: [VALUE] },
      null,
      { username: "" },
      [VALUE]
    ],
    [
      "basic username handed over as well",
      { type: BASIC, memberProvidedFields: [VALUE] },
      { type: BASIC, memberProvidedFields: [USERNAME, VALUE] },
      { username: "stored-u" },
      null,
      [USERNAME, VALUE]
    ],
    ["basic unchanged", { type: BASIC }, { type: BASIC }, null, undefined, null],
    [
      "type changed to a member-provided bearer",
      { type: BASIC },
      { type: BEARER, memberProvidedFields: [VALUE] },
      null,
      null,
      [VALUE]
    ],
    ["type changed to passthrough", { type: BEARER }, { type: PASSTHROUGH }, null, null, null]
  ])("%s", (_, stored, update, sealedSecret, secret, memberProvidedFields) => {
    const written = mergeCredential(
      credential(update),
      storedService(stored as Parameters<typeof storedService>[0]),
      sealedSecret
    );
    expect(written.secret).toEqual(secret);
    expect(written.memberProvidedFields).toEqual(memberProvidedFields);
  });

  test.each([
    [
      "a token sent for a member-provided field",
      { type: BEARER, memberProvidedFields: [VALUE], sealed: false },
      { type: BEARER, value: "x" },
      "is member provided"
    ],
    [
      "a bearer taken back with no token",
      { type: BEARER, memberProvidedFields: [VALUE], sealed: false },
      { type: BEARER, memberProvidedFields: [] },
      "Provide a token when you stop leaving it to each member"
    ],
    [
      "a type change to bearer with no token",
      { type: BASIC },
      { type: BEARER },
      "Provide a new token when changing the credential type to bearer"
    ],
    [
      "a basic left with neither half",
      { type: BASIC, memberProvidedFields: [USERNAME, VALUE], sealed: false },
      { type: BASIC, memberProvidedFields: [] },
      "needs a username, a password, or both"
    ]
  ])("refuses %s", (_, stored, update, message) => {
    expect(() =>
      mergeCredential(credential(update), storedService(stored as Parameters<typeof storedService>[0]), null)
    ).toThrow(message);
  });
});

describe("isStoredSecretReplaced", () => {
  test.each([
    ["a token sent", { type: BEARER }, { type: BEARER, value: "new" }, { value: "new" }, true],
    ["nothing written", { type: BEARER }, { type: BEARER, headerName: "X" }, undefined, false],
    ["a stored token handed to members", { type: BEARER }, { type: BEARER, memberProvidedFields: [VALUE] }, null, true],
    [
      "a stored password handed to members",
      { type: BASIC },
      { type: BASIC, memberProvidedFields: [VALUE] },
      { username: "u" },
      true
    ],
    [
      "a member-provided password taken back empty",
      { type: BASIC, memberProvidedFields: [VALUE] },
      { type: BASIC, memberProvidedFields: [] },
      { username: "u", password: "" },
      false
    ],
    ["a type change over a stored secret", { type: BEARER }, { type: PASSTHROUGH }, null, true],
    [
      "a type change with nothing stored before or after",
      { type: PASSTHROUGH, sealed: false },
      { type: BEARER, memberProvidedFields: [VALUE] },
      null,
      false
    ]
  ])("%s", (_, stored, update, written, replaced) => {
    expect(
      isStoredSecretReplaced(
        credential(update),
        storedService(stored as Parameters<typeof storedService>[0]),
        written as Record<string, string> | null | undefined
      )
    ).toBe(replaced);
  });
});

describe("needsStoredSecretFor", () => {
  test.each([
    ["a basic password rotated keeps the stored username", { type: BASIC }, { type: BASIC, password: "p" }, true],
    ["a basic with both halves sent", { type: BASIC }, { type: BASIC, username: "u", password: "p" }, false],
    ["a basic left unchanged", { type: BASIC }, { type: BASIC }, false],
    [
      "a basic password handed to members keeps the stored username",
      { type: BASIC },
      { type: BASIC, memberProvidedFields: [VALUE] },
      true
    ],
    [
      "a basic half taken back has nothing stored to keep",
      { type: BASIC, memberProvidedFields: [USERNAME, VALUE] },
      { type: BASIC, memberProvidedFields: [VALUE] },
      false
    ],
    ["a basic with nothing sealed", { type: BASIC, sealed: false }, { type: BASIC, password: "p" }, false],
    ["a bearer", { type: BEARER }, { type: BEARER, value: "t" }, false],
    ["a type change", { type: BEARER }, { type: BASIC, password: "p" }, false]
  ])("%s", (_, stored, update, needed) => {
    expect(needsStoredSecretFor(credential(update), storedService(stored as Parameters<typeof storedService>[0]))).toBe(
      needed
    );
  });
});
