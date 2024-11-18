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
}