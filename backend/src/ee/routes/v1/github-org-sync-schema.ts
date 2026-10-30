import { z } from "zod";

import { CharacterType, zodValidateCharacters } from "@app/lib/validator/validate-string";

const githubOrgNameAllowedCharacters = [CharacterType.AlphaNumeric, CharacterType.Hyphen];
const githubOrgNameValidator = zodValidateCharacters(githubOrgNameAllowedCharacters);

export const GithubOrgNameCreateSchema = githubOrgNameValidator(z.string().trim(), "GitHub Org Name");

export const GithubOrgNamePatchSchema = z
  .string()
  .trim()
  .min(1, "GitHub Org Name is required")
  .pipe(githubOrgNameValidator(z.string(), "GitHub Org Name"));
