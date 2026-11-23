import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import {
  getBuiltInAgentVaultPolicy,
  policyToRules,
  rulesToPolicy
} from "@app/components/agent-vault/policy-editor/agentVaultPolicyModel";
import { ProjectMembershipRole, TProjectPermission } from "@app/hooks/api/roles/types";
import { slugSchema } from "@app/lib/schemas";

const RESERVED_ROLE_SLUGS: string[] = Object.values(ProjectMembershipRole);

// Members pick a role by its name, so a name can't pass for a built-in role or for another role that only differs by a
// character no one can see. Matches the API's checks and messages.
const ROLE_NAME_DISALLOWED_RE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u;
const BUILT_IN_ROLE_NAMES = ["admin", "no access", "no-access"];

export const roleDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for the role.")
    .refine(
      (name) => !ROLE_NAME_DISALLOWED_RE.test(name),
      "A role name can't contain line breaks, tabs, or invisible characters such as zero-width spaces or text direction marks."
    )
    .refine(
      (name) => !BUILT_IN_ROLE_NAMES.includes(name.toLowerCase()),
      "This is the name of a built-in role. Choose a different name."
    ),
  slug: slugSchema({ min: 1, max: 64 }).refine(
    (slug) => !RESERVED_ROLE_SLUGS.includes(slug),
    "A built-in role uses this slug. Choose a different one."
  ),
  description: z.string().trim()
});

export type TRoleDetailsForm = z.infer<typeof roleDetailsSchema>;

export const toRoleSlug = (name: string) => slugify(name, { lowercase: true });

/**
 * The rules a role holds in Agent Vault. A built-in role's come from the editor rather than the API, which answers with
 * the rules it has in other project types.
 */
export const agentVaultRoleRules = (role: { slug: string; permissions: TProjectPermission[] }) => {
  const builtIn = getBuiltInAgentVaultPolicy(role.slug);
  return builtIn ? policyToRules(builtIn) : role.permissions;
};

// The admin role carries actions the API refuses in a custom one, such as the legacy grant beside what replaced it, so
// a copy is written from what the rules come to rather than from the rules themselves. Rules the editor can't hold are
// copied as they are.
export const rulesForCopy = (rules: TProjectPermission[]) => {
  const { policy, unsupported } = rulesToPolicy(rules);
  return unsupported.length ? rules : policyToRules(policy);
};
