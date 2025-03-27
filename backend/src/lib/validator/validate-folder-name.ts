import { CharacterType, characterValidator } from "./validate-string";

// regex to allow only alphanumeric, dash, underscore
export const isValidFolderName = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Hyphen,
  CharacterType.Underscore
]);

export const isValidSecretPath = (path: string) =>
  path
    .split("/")
    .filter((el) => el.length)
    .every((name) => isValidFolderName(name));
