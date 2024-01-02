import path from "node:path";

export function containsGlobPatterns(secretPath: string) {
  const globChars = ["*", "?", "[", "]", "{", "}", "**"];
  const normalizedPath = path.normalize(secretPath);
  return globChars.some((char) => normalizedPath.includes(char));
}
