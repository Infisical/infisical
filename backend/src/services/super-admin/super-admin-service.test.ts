import nodeCrypto from "node:crypto";

import { expect, test, vi } from "vitest";

import { superAdminServiceFactory } from "./super-admin-service";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ SALT_ROUNDS: 4, DISABLE_BREACHED_PASSWORD_CHECK: false })
}));
vi.mock("@app/lib/config/request", () => ({ request: { get: mocks.get } }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const BREACHED_PASSWORD = "Breached-Password-7!";

test("admin signup refuses a breached password before creating the account", async () => {
  const hash = nodeCrypto.createHash("sha1").update(BREACHED_PASSWORD, "utf8").digest("hex").toUpperCase();
  mocks.get.mockResolvedValue({ data: `${hash.slice(5)}:3\r\n` });
  const userDAL = { findOne: vi.fn().mockResolvedValue(undefined), transaction: vi.fn() };
  const service = superAdminServiceFactory({ userDAL } as never);

  await expect(
    service.adminSignUp({
      email: "admin@example.com",
      password: BREACHED_PASSWORD,
      firstName: "Ada",
      ip: "127.0.0.1",
      userAgent: "vitest"
    })
  ).rejects.toThrow("known data breach");
  expect(userDAL.transaction).not.toHaveBeenCalled();
});

test("admin signup stops if the instance was set up during the breach lookup", async () => {
  let initialized = false;
  mocks.get.mockImplementation(async () => {
    initialized = true;
    return { data: "" };
  });
  const userDAL = { findOne: vi.fn().mockResolvedValue(undefined), transaction: vi.fn() };
  const serverCfgDAL = { findById: vi.fn(async () => ({ initialized })) };
  const service = superAdminServiceFactory({ userDAL, serverCfgDAL } as never);

  await expect(
    service.adminSignUp({
      email: "admin@example.com",
      password: "Not-In-The-List-7!",
      firstName: "Ada",
      ip: "127.0.0.1",
      userAgent: "vitest"
    })
  ).rejects.toThrow("Admin account has already been set up");
  expect(userDAL.transaction).not.toHaveBeenCalled();
});
