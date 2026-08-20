import { isSecretPathMatch, parseSecretPathSearch, resolveSecretDeepSearch } from "./dashboard-secret-search-fns";

describe("parseSecretPathSearch", () => {
  test.each([
    [undefined, "", ""],
    ["", "", ""],
    ["https:", "https:", ""],
    ["/", "", "/"],
    ["https:/", "", "/https:"],
    ["https://service.ariba", "service.ariba", "/https:"],
    ["prod/api", "api", "/prod"],
    ["prod/", "", "/prod"],
    ["Prod/api", "api", "/prod"],
    ["a/b/c", "c", "/a/b"],
    ["/prod/api", "api", "/prod"]
  ])("splits %p into name %p and path %p", (search, searchName, searchPath) => {
    expect(parseSecretPathSearch(search)).toEqual({ searchName, searchPath });
  });
});

describe("isSecretPathMatch", () => {
  test("matches an ending path segment case-insensitively", () => {
    expect(isSecretPathMatch("/Prod", "/prod")).toBe(true);
    expect(isSecretPathMatch("/eu/Prod", "/prod")).toBe(true);
    expect(isSecretPathMatch("/production", "/prod")).toBe(false);
  });
});

describe("resolveSecretDeepSearch", () => {
  const folderPaths = ["/", "/prod", "/prod/api", "/eu/Staging", "/a/b", "/a/b/c"];

  test("searches a slash-containing query literally when the path is not a folder", () => {
    expect(resolveSecretDeepSearch("https:/", folderPaths)).toEqual({ searchName: "https:/", searchPath: "" });
    expect(resolveSecretDeepSearch("https://service.ariba", folderPaths)).toEqual({
      searchName: "https://service.ariba",
      searchPath: ""
    });
    expect(resolveSecretDeepSearch("adress1-JDANDEV/", folderPaths)).toEqual({
      searchName: "adress1-JDANDEV/",
      searchPath: ""
    });
  });

  test("searches a slash-containing query with LIKE metacharacters literally", () => {
    expect(resolveSecretDeepSearch("https://service.ariba/a_b", folderPaths)).toEqual({
      searchName: "https://service.ariba/a_b",
      searchPath: ""
    });
    expect(resolveSecretDeepSearch("https://service.ariba/100%", folderPaths)).toEqual({
      searchName: "https://service.ariba/100%",
      searchPath: ""
    });
  });

  test("scopes to a folder when the derived path exists", () => {
    expect(resolveSecretDeepSearch("prod/api", folderPaths)).toEqual({ searchName: "api", searchPath: "/prod" });
    expect(resolveSecretDeepSearch("prod/", folderPaths)).toEqual({ searchName: "", searchPath: "/prod" });
  });

  test("scopes to a folder even when the name contains LIKE metacharacters", () => {
    expect(resolveSecretDeepSearch("prod/a_b", folderPaths)).toEqual({ searchName: "a_b", searchPath: "/prod" });
    expect(resolveSecretDeepSearch("prod/100%", folderPaths)).toEqual({ searchName: "100%", searchPath: "/prod" });
  });

  test("supports multi-segment paths", () => {
    expect(resolveSecretDeepSearch("a/b/c", folderPaths)).toEqual({ searchName: "c", searchPath: "/a/b" });
  });

  test("resolves a folder path case-insensitively", () => {
    expect(resolveSecretDeepSearch("Staging/db", folderPaths)).toEqual({ searchName: "db", searchPath: "/staging" });
  });

  test("always honors the root path", () => {
    expect(resolveSecretDeepSearch("/", [])).toEqual({ searchName: "", searchPath: "/" });
  });

  test("leaves queries without a slash untouched", () => {
    expect(resolveSecretDeepSearch("https:", folderPaths)).toEqual({ searchName: "https:", searchPath: "" });
    expect(resolveSecretDeepSearch(undefined, folderPaths)).toEqual({ searchName: "", searchPath: "" });
  });
});
