import { getHierarchicalParameterName } from "./aws-parameter-store-sync-fns";

describe("getHierarchicalParameterName", () => {
  test("mirrors the secret's Infisical folder path under the destination path", () => {
    const name = getHierarchicalParameterName({
      destinationPath: "/myapp/",
      secretPath: "/a/b/c",
      key: "d",
      keySchema: undefined,
      environment: "prod"
    });

    expect(name).toBe("/myapp/a/b/c/d");
  });

  test("does not add a folder segment for a secret at the root path", () => {
    const name = getHierarchicalParameterName({
      destinationPath: "/myapp/",
      secretPath: "/",
      key: "DB_PASSWORD",
      keySchema: undefined,
      environment: "prod"
    });

    expect(name).toBe("/myapp/DB_PASSWORD");
  });

  test("applies the key schema's own segments after the folder segment", () => {
    const name = getHierarchicalParameterName({
      destinationPath: "/myapp/",
      secretPath: "/a/b",
      key: "DB_PASSWORD",
      keySchema: "{{environment}}/{{secretKey}}",
      environment: "prod"
    });

    expect(name).toBe("/myapp/a/b/prod/DB_PASSWORD");
  });
});
