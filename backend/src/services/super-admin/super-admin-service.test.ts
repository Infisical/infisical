import { expect, test, vi } from "vitest";

import { FakeInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/testing/fake-instance-config-service";
import { breachedRangeResponse } from "@app/lib/validator/breached-password.test-utils";

import { superAdminServiceFactory } from "./super-admin-service";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ SALT_ROUNDS: 4, BREACHED_PASSWORD_CHECK_ENABLED: true })
}));
vi.mock("@app/lib/config/request", () => ({ request: { get: mocks.get } }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const BREACHED_PASSWORD = "Breached-Password-7!";

test("admin signup refuses a breached password before creating the account", async () => {
  mocks.get.mockResolvedValue(breachedRangeResponse(BREACHED_PASSWORD));
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
  const instanceConfigService = new FakeInstanceConfigService();
  mocks.get.mockImplementation(async () => {
    await instanceConfigService.within().completeSetup({ closeSignUp: false });
    await instanceConfigService.refreshSharedCopy();
    return { data: "" };
  });
  const userDAL = { findOne: vi.fn().mockResolvedValue(undefined), transaction: vi.fn() };
  const service = superAdminServiceFactory({ userDAL, instanceConfigService } as never);

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
