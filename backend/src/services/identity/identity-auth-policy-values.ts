// Bound claim and audience fields are comma-separated lists of glob patterns.
// Bash brace globs like `{s,org/.github/}` contain commas that are not list separators.

export const splitCommaSeparatedPolicyValues = (value: string): string[] => {
  const matchedOpeningBraces = new Set<number>();
  const openingBraces: number[] = [];
  const parts: string[] = [];
  let current = "";
  let braceDepth = 0;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (!escaped && char === "{") {
      openingBraces.push(index);
    } else if (!escaped && char === "}" && openingBraces.length > 0) {
      matchedOpeningBraces.add(openingBraces.pop() as number);
    }

    escaped = char === "\\" && !escaped;
  }

  escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (!escaped && char === "{" && matchedOpeningBraces.has(index)) {
      braceDepth += 1;
    } else if (!escaped && char === "}" && braceDepth > 0) {
      braceDepth -= 1;
    }

    if (char === "," && braceDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
    } else {
      current += char;
    }

    escaped = char === "\\" && !escaped;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
};

export const formatCommaSeparatedPolicyValues = (value: string) => {
  if (value === "") return "";
  return splitCommaSeparatedPolicyValues(value).join(", ");
};
