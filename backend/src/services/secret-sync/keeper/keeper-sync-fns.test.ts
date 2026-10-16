import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KeeperCommandError } from "@app/services/app-connection/keeper";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { KeeperSyncFns } from "./keeper-sync-fns";
import { TKeeperSyncWithCredentials } from "./keeper-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@app/lib/validator/safe-request", () => ({ safeRequest: { post } }));

type TFakeRecord = { uid: string; title: string; type?: string; password?: string };

const FOLDER_UID = "FolderUid_123-abc";

const syncWith = (syncOptions: { disableSecretDeletion?: boolean; keySchema?: string } = {}, folderUid = FOLDER_UID) =>
  ({
    destination: "keeper-password-manager",
    destinationConfig: { folderUid, folderName: "Shared" },
    environment: { slug: "dev" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
    connection: { method: "api-key", credentials: { apiKey: "api-key", instanceUrl: "https://keeper.example.com/" } }
  }) as unknown as TKeeperSyncWithCredentials;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const success = (data: unknown) => ({ data: { status: "success", command: "test", data } });

const base64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

const fakeKeeper = (
  records: TFakeRecord[],
  lsShape: "rows" | "grouped" = "rows",
  respondToWrite?: (command: string) => unknown
) => {
  post.mockImplementation(async (_url: string, { command }: { command: string }) => {
    if (command.startsWith("ls ")) {
      if (lsShape === "grouped") {
        return success({
          folders: [{ uid: "SubFolder", name: "Nested" }],
          records: records.map((record) => ({ uid: record.uid, title: record.title, type: record.type ?? "login" }))
        });
      }

      return success([
        { type: "folder", uid: "SubFolder", name: "Nested", details: "Flags: S" },
        ...records.map((record) => ({
          type: "record",
          uid: record.uid,
          name: record.title,
          details: `Type: ${record.type ?? "login"}, Description: `
        }))
      ]);
    }

    if (command.startsWith("get ")) {
      const record = records.find((r) => command === `get --format=json ${r.uid}`);
      return success({
        record_uid: record?.uid,
        title: record?.title,
        type: record?.type ?? "login",
        fields: [
          { type: "login", value: [] },
          { type: "password", value: record?.password === undefined ? [] : [record.password] }
        ]
      });
    }

    return respondToWrite?.(command) ?? success(null);
  });
};

const sentCommands = () => post.mock.calls.map(([, body]) => (body as { command: string }).command);

const writeCommands = () => sentCommands().filter((command) => !/^(sync-down$|ls |get )/.test(command));

describe("KeeperSyncFns", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("sends every command to the Service Mode endpoint with the API key", async () => {
    fakeKeeper([]);

    await KeeperSyncFns.getSecrets(syncWith());

    const [url, body, options] = post.mock.calls[0] as [
      string,
      { command: string },
      { headers: Record<string, string> }
    ];
    expect(url).toBe("https://keeper.example.com/api/v1/executecommand");
    expect(body).toEqual({ command: "sync-down" });
    expect(options.headers["api-key"]).toBe("api-key");
  });

  it("syncs the vault down before listing the shared folder", async () => {
    fakeKeeper([{ uid: "uid-a", title: "A", password: "a" }]);

    await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({ A: "a" }));

    expect(sentCommands()).toEqual(["sync-down", `ls --format=json ${FOLDER_UID}`, "get --format=json uid-a"]);
  });

  it("creates missing records, updates changed ones and skips unchanged ones", async () => {
    fakeKeeper([
      { uid: "uid-same", title: "SAME", password: "unchanged" },
      { uid: "uid-changed", title: "CHANGED", password: "old" }
    ]);

    await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({ SAME: "unchanged", CHANGED: "new", NEW: "fresh" }));

    expect(writeCommands()).toEqual([
      `record-update -f --record=uid-changed 'password=$BASE64:${base64("new")}'`,
      `record-add -f --folder=${FOLDER_UID} --record-type=login --title='NEW' 'password=$BASE64:${base64("fresh")}'`
    ]);
  });

  it("quotes titles so quotes, spaces and leading dashes survive shell tokenizing", async () => {
    fakeKeeper([]);

    await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({ '-it\'s a "key"': "value with 'quotes'\nand lines" }));

    expect(writeCommands()).toEqual([
      `record-add -f --folder=${FOLDER_UID} --record-type=login --title='-it'"'"'s a "key"' 'password=$BASE64:${base64(
        "value with 'quotes'\nand lines"
      )}'`
    ]);
  });

  it("rejects keys Commander would expand as variables before writing anything", async () => {
    fakeKeeper([]);

    const error = await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({ OK: "a", [`\${HOME}`]: "b" })).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).secretKey).toBe(`\${HOME}`);
    expect(post).not.toHaveBeenCalled();
  });

  it("deletes stale records that match the key schema", async () => {
    fakeKeeper([
      { uid: "uid-keep", title: "INF_KEEP", password: "a" },
      { uid: "uid-stale", title: "INF_STALE", password: "b" },
      { uid: "uid-foreign", title: "FOREIGN", password: "c" }
    ]);

    await KeeperSyncFns.syncSecrets(syncWith({ keySchema: "INF_{{secretKey}}" }), payloadOf({ INF_KEEP: "a" }));

    expect(writeCommands()).toEqual(["rm -f --purge uid-stale"]);
  });

  it("keeps stale records when secret deletion is disabled", async () => {
    fakeKeeper([{ uid: "uid-stale", title: "STALE", password: "b" }]);

    await KeeperSyncFns.syncSecrets(syncWith({ disableSecretDeletion: true }), payloadOf({}));

    expect(writeCommands()).toEqual([]);
  });

  it("deletes duplicate records that share a synced title", async () => {
    fakeKeeper([
      { uid: "uid-first", title: "DUP", password: "value" },
      { uid: "uid-second", title: "DUP", password: "other" }
    ]);

    await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({ DUP: "value" }));

    expect(writeCommands()).toEqual(["rm -f --purge uid-second"]);
  });

  it("never touches records that are not login records", async () => {
    fakeKeeper([{ uid: "uid-db", title: "DB", type: "databaseCredentials", password: "secret" }]);

    await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({}));

    expect(writeCommands()).toEqual([]);
  });

  it("skips record UIDs that are not valid Keeper UIDs", async () => {
    fakeKeeper([{ uid: "bad uid'; rm", title: "BAD", password: "x" }]);

    await expect(KeeperSyncFns.getSecrets(syncWith())).resolves.toEqual({});
    expect(sentCommands()).toEqual(["sync-down", `ls --format=json ${FOLDER_UID}`]);
  });

  it("skips records whose UID starts with a dash, since Service Mode blocks the -- separator", async () => {
    fakeKeeper([
      { uid: "-dashUid", title: "DASH", password: "x" },
      { uid: "uid-a", title: "A", password: "a" }
    ]);

    await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({ A: "a" }));

    expect(sentCommands()).toEqual(["sync-down", `ls --format=json ${FOLDER_UID}`, "get --format=json uid-a"]);
  });

  it("refuses a shared folder whose UID starts with a dash before sending anything", async () => {
    fakeKeeper([]);

    const error = await KeeperSyncFns.syncSecrets(syncWith({}, "-folderUid"), payloadOf({ A: "a" })).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it.each(["rows", "grouped"] as const)("imports login records from the %s ls shape", async (lsShape) => {
    fakeKeeper(
      [
        { uid: "uid-a", title: "A", password: "a-value" },
        { uid: "uid-empty", title: "EMPTY" },
        { uid: "uid-note", title: "NOTE", type: "encryptedNotes" }
      ],
      lsShape
    );

    await expect(KeeperSyncFns.getSecrets(syncWith())).resolves.toEqual({
      A: { value: "a-value" },
      EMPTY: { value: "" }
    });
  });

  it("removes only the records named in the payload", async () => {
    fakeKeeper([
      { uid: "uid-a", title: "A", password: "a" },
      { uid: "uid-b", title: "B", password: "b" }
    ]);

    await KeeperSyncFns.removeSecrets(syncWith(), payloadOf({ A: "a" }));

    expect(writeCommands()).toEqual(["rm -f --purge uid-a"]);
  });

  it("redacts the secret value from Keeper's error text", async () => {
    fakeKeeper([], "rows", (command) =>
      command.startsWith("record-add")
        ? { data: { status: "error", command: "record-add", error: `Invalid value s3cr3t (${base64("s3cr3t")})` } }
        : undefined
    );

    const error = (await KeeperSyncFns.syncSecrets(syncWith(), payloadOf({ KEY: "s3cr3t" })).catch(
      (err: unknown) => err
    )) as SecretSyncError;

    expect(error).toBeInstanceOf(SecretSyncError);
    expect(error.secretKey).toBe("KEY");
    expect(error.error).toBeInstanceOf(KeeperCommandError);
    const { message } = error.error as KeeperCommandError;
    expect(message).toContain("record-add");
    expect(message).not.toContain("s3cr3t");
    expect(message).not.toContain(base64("s3cr3t"));
  });

  it("wraps HTTP failures without exposing the Axios error", async () => {
    post.mockRejectedValue(
      new AxiosError("forbidden", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 403,
        statusText: "Forbidden",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { status: "error", error: "Command 'ls' is not allowed for this API key" }
      })
    );

    const error = await KeeperSyncFns.getSecrets(syncWith()).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(KeeperCommandError);
    expect((error as KeeperCommandError).statusCode).toBe(403);
    expect((error as KeeperCommandError).message).toContain("is not allowed for this API key");
  });
});
