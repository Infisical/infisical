import { vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  assertFolderNameNotReserved,
  assertFolderNotReserved,
  rewriteReservedImportPaths
} from "./secret-folder-reserved-fns";

describe("assertFolderNameNotReserved", () => {
  test("refuses the replication prefix", () => {
    expect(() => assertFolderNameNotReserved("__reserve_replication_abc")).toThrow(BadRequestError);
  });

  test("accepts other names", () => {
    expect(() => assertFolderNameNotReserved("reserve_replication")).not.toThrow();
  });
});

describe("assertFolderNotReserved", () => {
  test("refuses a reserved folder", () => {
    expect(() => assertFolderNotReserved({ isReserved: true, path: "/prod/x" })).toThrow(BadRequestError);
  });

  test("refuses a path under a reserved folder", () => {
    expect(() => assertFolderNotReserved({ path: "/prod/__reserve_replication_abc/sub" })).toThrow(BadRequestError);
  });

  test("accepts a regular folder", () => {
    expect(() => assertFolderNotReserved({ isReserved: false, path: "/prod/app" })).not.toThrow();
  });
});

describe("rewriteReservedImportPaths", () => {
  test("moves reserved import paths under the renamed folder and leaves the rest", async () => {
    const secretImportDAL = {
      find: vi.fn().mockResolvedValue([
        { id: "1", importPath: "/prod/__reserve_replication_1" },
        { id: "2", importPath: "/prod/app/__reserve_replication_2" },
        { id: "3", importPath: "/production/__reserve_replication_3" }
      ]),
      updateById: vi.fn()
    };

    await rewriteReservedImportPaths(
      { envId: "env", oldPath: "/prod", newPath: "/live" },
      secretImportDAL as unknown as Parameters<typeof rewriteReservedImportPaths>[1]
    );

    expect(secretImportDAL.updateById).toHaveBeenCalledTimes(2);
    expect(secretImportDAL.updateById).toHaveBeenCalledWith(
      "1",
      { importPath: "/live/__reserve_replication_1" },
      undefined
    );
    expect(secretImportDAL.updateById).toHaveBeenCalledWith(
      "2",
      { importPath: "/live/app/__reserve_replication_2" },
      undefined
    );
  });

  test("does nothing when the path is unchanged", async () => {
    const secretImportDAL = { find: vi.fn(), updateById: vi.fn() };
    await rewriteReservedImportPaths(
      { envId: "env", oldPath: "/prod", newPath: "/prod" },
      secretImportDAL as unknown as Parameters<typeof rewriteReservedImportPaths>[1]
    );
    expect(secretImportDAL.find).not.toHaveBeenCalled();
  });
});
