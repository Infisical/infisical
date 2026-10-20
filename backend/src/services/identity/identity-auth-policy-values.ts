// Bound claim and audience fields are comma-separated lists of glob patterns.
// Bash brace globs like `{s,org/.github/}` contain commas that are not list separators.

export const splitCommaSeparatedPolicyValues = (value: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (const char of value) {
    if (char === "{") {
      braceDepth += 1;
    } else if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
    }

    if (char === "," && braceDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
};

export const formatCommaSeparatedPolicyValues = (value: string) => {
  if (value === "") return "";
  return splitCommaSeparatedPolicyValues(value).join(", ");
};
