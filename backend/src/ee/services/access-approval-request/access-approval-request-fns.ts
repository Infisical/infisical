import { PackRule, unpackRules } from "@casl/ability/extra";

import { BadRequestError } from "@app/lib/errors";

import { TVerifyPermission } from "./access-approval-request-types";

// Turn a permission slug into a human-readable label, e.g. "dynamic-secrets" -> "Dynamic Secrets"
// and "read-root-credential" -> "Read Root Credential". Used for review notifications.
const humanizeSlug = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");

export const verifyRequestedPermissions = ({ permissions }: TVerifyPermission) => {
  const permission = unpackRules(
    permissions as PackRule<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions?: Record<string, any>;
      action: string | string[];
      subject: string | string[];
    }>[]
  );

  if (!permission || !permission.length) {
    throw new BadRequestError({ message: "No permission provided" });
  }

  const firstPermission = permission[0];

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const permissionSecretPath = firstPermission.conditions?.secretPath?.$glob;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const permissionEnv = firstPermission.conditions?.environment;

  if (!permissionEnv || typeof permissionEnv !== "string") {
    throw new BadRequestError({ message: "Permission environment is not a string" });
  }
  if (!permissionSecretPath || typeof permissionSecretPath !== "string") {
    throw new BadRequestError({ message: "Permission path is not a string" });
  }

  // Collect every requested subject and its actions (not just secret CRUD) so the approval
  // notifications surface the full scope of access being requested and nothing is hidden.
  const actionsBySubject = new Map<string, Set<string>>();

  for (const p of permission) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const ruleEnv = p.conditions?.environment;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const rulePath = p.conditions?.secretPath?.$glob;

    if (ruleEnv !== permissionEnv || rulePath !== permissionSecretPath) {
      throw new BadRequestError({
        message: "All permission rules must target the same environment and secret path"
      });
    }

    const subjects = Array.isArray(p.subject) ? p.subject : [p.subject];
    const actions = Array.isArray(p.action) ? p.action : [p.action];

    subjects.forEach((subject) => {
      if (!subject) return;
      const subjectActions = actionsBySubject.get(subject) ?? new Set<string>();
      actions.forEach((action) => {
        if (action) subjectActions.add(action);
      });
      actionsBySubject.set(subject, subjectActions);
    });
  }

  const accessTypes = Array.from(actionsBySubject.entries()).map(
    ([subject, actions]) =>
      `${humanizeSlug(subject)} (${Array.from(actions)
        .map((action) => humanizeSlug(action))
        .join(", ")})`
  );

  return {
    envSlug: permissionEnv,
    secretPath: permissionSecretPath,
    accessTypes
  };
};
