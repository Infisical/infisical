import odbc from "odbc";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SapAseProvider } from "./sap-ase";

vi.mock("odbc", () => ({ default: { connect: vi.fn() } }));
vi.mock("../dynamic-secret-fns", () => ({ verifyHostInputValidity: vi.fn() }));

const mockedConnect = vi.mocked(odbc.connect);

const metadata = { projectId: "proj-1" };

const inputs = (password: string) => ({
  host: "db.example.com",
  port: 5000,
  database: "app",
  username: "sa",
  password,
  creationStatement: "sp_addlogin '{{username}}', '{{password}}'",
  revocationStatement: "sp_droplogin '{{username}}'"
});

describe("SapAseProvider connection string", () => {
  beforeEach(() => {
    mockedConnect.mockReset();
    mockedConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue([{ version: "16.0" }]),
      close: vi.fn()
    } as unknown as Awaited<ReturnType<typeof odbc.connect>>);
  });

  test("wraps a value containing ';' in braces and leaves plain values as they are", async () => {
    await SapAseProvider().validateConnection(inputs("pa;ss"), metadata);

    const connectionString = mockedConnect.mock.calls[0][0] as unknown as string;
    expect(connectionString).toContain("UID=sa;PWD={pa;ss};");
  });

  test("refuses a value containing both ';' and '}'", async () => {
    await expect(SapAseProvider().validateConnection(inputs("pa;ss}"), metadata)).rejects.toThrow('cannot contain "}"');
    expect(mockedConnect).not.toHaveBeenCalled();
  });
});
