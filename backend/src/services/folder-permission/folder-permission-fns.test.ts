import { TemporaryPermissionMode } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { computeTemporaryFields, resolveFolder } from "./folder-permission-fns";

describe("computeTemporaryFields", () => {
  test.each([undefined, { isTemporary: false as const }])("returns permanent fields for %o", (input) => {
    expect(computeTemporaryFields(input)).toEqual({
      isTemporary: false,
      temporaryMode: null,
      temporaryRange: null,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null
    });
  });

  test("computes a relative window from the provided start time", () => {
    const startTime = "2026-08-18T19:18:50.978Z";
    const result = computeTemporaryFields({
      isTemporary: true,
      temporaryMode: TemporaryPermissionMode.Relative,
      temporaryRange: "4h",
      temporaryAccessStartTime: startTime
    });

    expect(result.isTemporary).toBe(true);
    expect(result.temporaryMode).toBe(TemporaryPermissionMode.Relative);
    expect(result.temporaryRange).toBe("4h");
    expect(result.temporaryAccessStartTime).toEqual(new Date(startTime));
    expect(result.temporaryAccessEndTime!.getTime() - result.temporaryAccessStartTime!.getTime()).toBe(ms("4h"));
  });
});

describe("resolveFolder", () => {
  const stubSecretFolderDAL = (result: unknown) =>
    ({
      findBySecretPath: async () => result
    }) as unknown as Pick<TSecretFolderDALFactory, "findBySecretPath">;

  test("throws NotFoundError naming the environment and path when the folder does not exist", async () => {
    await expect(resolveFolder("project-1", "dev", "/missing", stubSecretFolderDAL(undefined))).rejects.toThrow(
      NotFoundError
    );
    await expect(resolveFolder("project-1", "dev", "/missing", stubSecretFolderDAL(undefined))).rejects.toThrow(
      /'\/missing'.*'dev'/
    );
  });

  test("throws BadRequestError for a reserved folder", async () => {
    const folder = { id: "folder-1", path: "/reserved", isReserved: true, environment: { slug: "dev" } };
    await expect(resolveFolder("project-1", "dev", "/reserved", stubSecretFolderDAL(folder))).rejects.toThrow(
      BadRequestError
    );
  });

  test("returns the folder id and canonical path and environment slug", async () => {
    const folder = { id: "folder-1", path: "/app", isReserved: false, environment: { slug: "dev" } };
    await expect(resolveFolder("project-1", "dev", "/app/", stubSecretFolderDAL(folder))).resolves.toEqual({
      id: "folder-1",
      path: "/app",
      environmentSlug: "dev"
    });
  });
});
