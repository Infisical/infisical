import picomatch from "picomatch";

import { TSecretValidationRule } from "./types";

// whether a rule covers a given environment and path
export const doesRuleCoverScope = (
  rule: TSecretValidationRule,
  { secretPath, environmentSlugs }: { secretPath?: string; environmentSlugs?: string[] }
): boolean => {
  if (!secretPath) return false;
  if (!picomatch.isMatch(secretPath, rule.secretPath, { strictSlashes: false })) return false;
  if (!rule.environment) return true;

  // With no environment to compare against, the path match is all there is to go on.
  if (!environmentSlugs?.length) return true;
  return environmentSlugs.includes(rule.environment.slug);
};
