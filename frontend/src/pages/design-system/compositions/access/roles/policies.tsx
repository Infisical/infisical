import type { Scope } from "../model";
import type { PermissionSubject } from "./catalog";
import type { Rule } from "./permissions-model";

const LEGACY_PROJECT_ACTIONS: Record<string, string> = {
  member: "grant-privileges",
  identity: "grant-privileges",
  groups: "grant-privileges"
};

export const VISUALIZABLE = ["secrets", "secret-folders", "dynamic-secrets", "secret-imports"];

export const visibleActions = (scope: Scope, config: PermissionSubject, rule: Rule) =>
  config.actions.filter(({ value }) => {
    if (config.subject === "secrets" && value === "read") return rule.actions.includes(value);
    if (scope === "project" && LEGACY_PROJECT_ACTIONS[config.subject] === value)
      return rule.actions.includes(value);
    return true;
  });
