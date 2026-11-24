const LOWERCASE_ALPHANUMERIC = "abcdefghijklmnopqrstuvwxyz0123456789";

export const getAzureContainerNameError = (name: string): string | null => {
  if (!name) return "Container is required";
  if (name.length < 3 || name.length > 63) return "Container name must be 3-63 characters";
  const isValid =
    [...name].every((char) => char === "-" || LOWERCASE_ALPHANUMERIC.includes(char)) &&
    !name.startsWith("-") &&
    !name.endsWith("-") &&
    !name.includes("--");
  return isValid
    ? null
    : "Container name can only contain lowercase letters, numbers and single hyphens between them";
};
