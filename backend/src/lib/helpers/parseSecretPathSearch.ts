import { removeTrailingSlash } from "@app/lib/fn";

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
