import { assertHarnessDatabaseName, connectionUri, parsePostgresUrl } from "./postgres-connection";

describe("assertHarnessDatabaseName", () => {
  test("should accept a name with the harness prefix", () => {
    expect(() => assertHarnessDatabaseName("infisical_it_abc_w1")).not.toThrow();
  });

  test.each(["infisical", "infisical-test", "postgres", "infisical_it_ABC", "infisical_it_x; DROP DATABASE y"])(
    "should refuse %s",
    (name) => {
      expect(() => assertHarnessDatabaseName(name)).toThrow(`Refusing to touch database "${name}"`);
    }
  );
});

describe("parsePostgresUrl", () => {
  test("should round-trip through connectionUri with special characters in the password", () => {
    // Setup
    const url = "postgres://infisical:p%40ss%2Fword@db:5436/infisical-test";

    // Action
    const server = parsePostgresUrl(url);

    // Assert
    expect(server).toEqual({
      host: "db",
      port: 5436,
      user: "infisical",
      password: "p@ss/word",
      maintenanceDatabase: "infisical-test"
    });
    expect(connectionUri(server, "infisical_it_x")).toBe("postgres://infisical:p%40ss%2Fword@db:5436/infisical_it_x");
  });
});
