// regex to allow only alphanumeric, dash, underscore
export const isValidFolderName = (name: string) => /^[a-zA-Z0-9-_]+$/.test(name);

export const isValidSecretPath = (path: string) =>
  path
    .split("/")
    .filter((el) => el.length)
    .every((name) => isValidFolderName(name));
