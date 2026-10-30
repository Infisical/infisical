export const removeTrailingSlash = (str: string) => {
  if (str === "/") return str;

  return str.endsWith("/") ? str.slice(0, -1) : str;
};

export const isValidPath = (val: string): boolean => {
  if (val.length === 0) return false;
  if (val === "/") return true;

  // Check for valid characters and no consecutive slashes
  const validPathRegex = /^[a-zA-Z0-9-_.:]+(?:\/[a-zA-Z0-9-_.:]+)*$/;
  return validPathRegex.test(val);
};

export const DistinguishedNameRegex =
  /^(?:(?:[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)(?:(?:\\+[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)*)(?:,(?:[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)(?:(?:\\+[a-zA-Z0-9]+=[^,+="<>#;\\\\]+)*))*)?$/;

export const UserPrincipalNameRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const NAMES_SHOWN = 3;

/** Names a list for a sentence: "a", "a and b", "a, b and c", and past three, "a, b, c and 4 more". */
export const nameList = (names: string[]) => {
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  if (shown.length <= 2) return shown.join(" and ");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
};
