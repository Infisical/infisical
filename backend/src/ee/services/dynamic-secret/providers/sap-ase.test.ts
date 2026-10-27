import odbc from "odbc";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SapAseProvider } from "./sap-ase";

vi.mock("odbc", () => ({ default: { connect: vi.fn() } }));
vi.mock("../dynamic-secret-fns", () => ({ verifyHostInputValidity: vi.fn() }));

const mockedConnect = vi.mocked(odbc.connect);

const metadata = { projectId: "proj-1" };

const inputs = (overrides: { password?: string; database?: string }) => ({
  host: "db.example.com",
  port: 5000,
  database: "app",
  username: "sa",
  password: "plain",
  creationStatement: "sp_addlogin '{{username}}', '{{password}}'",
  revocationStatement: "sp_droplogin '{{username}}'",
  ...overrides
});

const connectionStrings = () => mockedConnect.mock.calls.map(([value]) => value as unknown as string);

describe("SapAseProvider connection string", () => {
  beforeEach(() => {
    mockedConnect.mockReset();
    mockedConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue([{ version: "16.0" }]),
      close: vi.fn()
    } as unknown as Awaited<ReturnType<typeof odbc.connect>>);
  });

  test.each([
    ["plain", "PWD=plain;"],
    ["pa;ss", "PWD={pa;ss};"],
    ["{abc", "PWD={{abc};"],
    ["{pa;ss}", "PWD={pa;ss};"]
  ])("formats password %s as %s", async (password, expected) => {
    await SapAseProvider().validateConnection(inputs({ password }), metadata);

    expect(connectionStrings()[0]).toContain(`UID=sa;${expected}`);
  });

  test("braces the database on the non-master connection", async () => {
    await SapAseProvider().validateConnection(inputs({ database: "a;b" }), metadata);

    expect(connectionStrings()[1]).toContain("DATABASE={a;b};");
  });

  test.each([
    ["pa;ss}", 'SAP ASE password cannot contain "}"'],
    ["pa\0ss", "SAP ASE password cannot contain a null character"]
  ])("refuses password %j before connecting", async (password, message) => {
    await expect(SapAseProvider().validateConnection(inputs({ password }), metadata)).rejects.toThrow(message);
    expect(mockedConnect).not.toHaveBeenCalled();
  });
});
