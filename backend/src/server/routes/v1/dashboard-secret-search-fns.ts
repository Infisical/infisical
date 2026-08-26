import { removeTrailingSlash } from "@app/lib/fn";

/**
 * Splits a deep search query into a folder path and a name so that a query like `prod/api`
 * can mean "things named `api` inside a folder path ending in `/prod`".
 *
 * The derived path is lowercased, so it must only ever be compared against folder paths
 * case-insensitively (see `isSecretPathMatch`).
 */
export const parseSecretPathSearch = (search?: string) => {
  if (!search)
    return {
      searchName: "",
      searchPath: ""
    };

  if (!search.includes("/"))
    return {
      searchName: search,
      searchPath: ""
    };

  if (search === "/")
    return {
      searchName: "",
      searchPath: "/"
    };

  const [searchName, ...searchPathSegments] = search.split("/").reverse();
  let searchPath = removeTrailingSlash(searchPathSegments.reverse().join("/").toLowerCase());
  if (!searchPath.startsWith("/")) searchPath = `/${searchPath}`;

  return {
    searchName,
    searchPath
  };
};

/** Case-insensitive because the search path derived by `parseSecretPathSearch` is lowercased. */
export const isSecretPathMatch = (path: string, searchPath: string) => path.toLowerCase().endsWith(searchPath);

/**
 * Resolves a deep search query into the free-text search term and the folder path scope.
 *
 * The path interpretation is only honored when the derived path resolves to a folder that
 * exists in the searched environments. Otherwise the query is searched for literally,
 * slashes included, so that values which merely happen to contain a slash — a secret
 * metadata value such as `https://example.com` — are still matched instead of being scoped
 * to a folder that does not exist.
 */
export const resolveSecretDeepSearch = (search: string | undefined, folderPaths: string[]) => {
  const { searchName, searchPath } = parseSecretPathSearch(search);

  if (!searchPath) return { searchName, searchPath };

  const searchPathExists =
    searchPath === "/" || folderPaths.some((folderPath) => isSecretPathMatch(folderPath, searchPath));

  if (searchPathExists) return { searchName, searchPath };

  return { searchName: search ?? "", searchPath: "" };
};
