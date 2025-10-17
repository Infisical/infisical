import {
  PermissionConditionOperators,
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { TFormSchema } from "./ProjectRoleModifySection.utils";

// ============================================================================
// Types
// ============================================================================

export type VaultMount = {
  path: string;
  type: string;
  version: string | null;
};

type ArrayElement<T> = T extends (infer U)[] ? U : never;

export type SecretPermissionRule = ArrayElement<
  NonNullable<TFormSchema["permissions"]>[ProjectPermissionSub.Secrets]
>;

export type FolderPermissionRule = ArrayElement<
  NonNullable<TFormSchema["permissions"]>[ProjectPermissionSub.SecretFolders]
>;

type ParsedVaultPath = {
  environment: string | null;
  secretPath: string | null;
  mount: VaultMount | null;
  isWildcardMount: boolean;
};

// ============================================================================
// Path Parsing
// ============================================================================

/**
 * Parses a Vault policy path to extract mount, environment, and secret path.
 *
 * Handles three types of path patterns:
 * 1. Global wildcards: "*" or "+" → matches all mounts, environments, paths
 * 2. Wildcard mounts: "* /data/prod/*" → matches all mounts with specific path
 * 3. Regular paths: "secret/data/prod/api-keys" → specific mount and path
 *
 * For KV v2 mounts:
 * - data/ paths → secret operations (read, write values)
 * - metadata/ paths → folder operations (create, delete folders)
 *
 * Path structure after mount:
 * - KV v2: [data|metadata]/{environment}/{secretPath}
 * - KV v1: {environment}/{secretPath}
 */
export const parseVaultPath = (vaultPath: string, mounts: VaultMount[]): ParsedVaultPath => {
  // Case 1: Global wildcard (e.g., "*" or "+") - matches everything
  if (vaultPath === "*" || vaultPath === "+") {
    const syntheticMount: VaultMount = {
      path: "*",
      type: "kv",
      version: "1" // Default to v1 for global wildcards
    };
    return {
      environment: "*",
      secretPath: "/*",
      mount: syntheticMount,
      isWildcardMount: true
    };
  }

  // Case 2: Wildcard mount (e.g., "*/data/*") - matches any mount with pattern
  const isWildcardMount = vaultPath.startsWith("*/") || vaultPath.startsWith("+/");

  if (isWildcardMount) {
    let remainingPath = vaultPath.slice(2); // Remove "*/" or "+/"
    if (remainingPath.startsWith("/")) remainingPath = remainingPath.slice(1);

    let environment: string | null = null;
    let secretPath: string | null = null;
    let isDataPath = false;
    let isMetadataPath = false;

    // Check for KV v2 data/ or metadata/ prefix
    if (remainingPath.startsWith("data/")) {
      isDataPath = true;
      remainingPath = remainingPath.slice(5);
    } else if (remainingPath.startsWith("metadata/")) {
      isMetadataPath = true;
      remainingPath = remainingPath.slice(9);
    }

    // Parse remaining segments
    const segments = remainingPath.split("/").filter(Boolean);

    if (segments.length > 0) {
      if (segments.length === 1 && (segments[0] === "*" || segments[0] === "+")) {
        environment = "*";
        secretPath = "/*";
      } else {
        [environment] = segments;
        secretPath = segments.length > 1 ? `/${segments.slice(1).join("/")}` : "/";
      }
    }

    // Create synthetic mount based on detected version
    const syntheticMount: VaultMount = {
      path: "*",
      type: "kv",
      version: isDataPath || isMetadataPath ? "2" : "1"
    };

    return { environment, secretPath, mount: syntheticMount, isWildcardMount: true };
  }

  // Case 3: Regular path (e.g., "secret/data/prod/api-keys")
  // Find matching mount (longest path first for most specific match)
  const sortedMounts = [...mounts].sort((a, b) => b.path.length - a.path.length);
  const mount = sortedMounts.find((m) => vaultPath.startsWith(m.path));

  if (!mount) {
    return { environment: null, secretPath: null, mount: null, isWildcardMount: false };
  }

  // Remove mount prefix
  let remainingPath = vaultPath.slice(mount.path.length);
  if (remainingPath.startsWith("/")) remainingPath = remainingPath.slice(1);

  const isKvV2 = mount.version === "2" || mount.type === "kv";

  // For KV v2, remove data/ or metadata/ prefix
  if (isKvV2) {
    if (remainingPath.startsWith("data/")) {
      remainingPath = remainingPath.slice(5);
    } else if (remainingPath.startsWith("metadata/")) {
      remainingPath = remainingPath.slice(9);
    }
  }

  // Parse environment and secret path
  const segments = remainingPath.split("/").filter(Boolean);
  let environment: string | null = null;
  let secretPath: string | null = null;

  if (segments.length > 0) {
    if (segments.length === 1 && (segments[0] === "*" || segments[0] === "+")) {
      // Single wildcard segment
      environment = null;
      secretPath = "/*";
    } else {
      // First segment is the environment
      [environment] = segments;
      // Remaining segments form the secret path
      secretPath = segments.length > 1 ? `/${segments.slice(1).join("/")}` : "/";
    }
  }

  return { environment, secretPath, mount, isWildcardMount: false };
};

// ============================================================================
// Capability Mapping
// ============================================================================

/**
 * Maps Vault capabilities to Infisical secret actions.
 *
 * Mapping:
 * - create → Create
 * - list → DescribeSecret (view metadata without values)
 * - read → DescribeSecret + ReadValue (full access)
 * - update/patch → Edit
 * - delete → Delete
 */
const mapVaultCapabilitiesToSecretActions = (capabilities: string[]): Record<string, boolean> => {
  const actions: Record<string, boolean> = {};

  if (capabilities.includes("create")) {
    actions[ProjectPermissionSecretActions.Create] = true;
  }
  if (capabilities.includes("list")) {
    actions[ProjectPermissionSecretActions.DescribeSecret] = true;
  }
  if (capabilities.includes("read")) {
    actions[ProjectPermissionSecretActions.DescribeSecret] = true;
    actions[ProjectPermissionSecretActions.ReadValue] = true;
  }
  if (capabilities.includes("update") || capabilities.includes("patch")) {
    actions[ProjectPermissionSecretActions.Edit] = true;
  }
  if (capabilities.includes("delete")) {
    actions[ProjectPermissionSecretActions.Delete] = true;
  }

  return actions;
};

/**
 * Maps Vault capabilities to Infisical folder actions.
 *
 * Mapping:
 * - create → Create
 * - update/patch → Edit
 * - delete → Delete
 *
 * Note: 'list' is not mapped for folders as it's handled at the secret level
 */
const mapVaultCapabilitiesToFolderActions = (capabilities: string[]): Record<string, boolean> => {
  const actions: Record<string, boolean> = {};

  if (capabilities.includes("create")) {
    actions[ProjectPermissionActions.Create] = true;
  }
  if (capabilities.includes("update") || capabilities.includes("patch")) {
    actions[ProjectPermissionActions.Edit] = true;
  }
  if (capabilities.includes("delete")) {
    actions[ProjectPermissionActions.Delete] = true;
  }

  return actions;
};

// ============================================================================
// Condition Building
// ============================================================================

type PermissionCondition = {
  lhs: string;
  operator: string;
  rhs: string;
};

/**
 * Converts Vault wildcard patterns to Infisical glob patterns.
 * - Vault '+' → picomatch '*' (matches single segment)
 * - Vault '*' → picomatch '**' (matches any depth)
 */
const convertVaultWildcardToGlob = (vaultPattern: string): string => {
  // Use a placeholder to avoid replacing + twice
  // Step 1: Replace + with a placeholder
  let result = vaultPattern.replace(/\+/g, "__PLUS__");
  // Step 2: Replace * with **
  result = result.replace(/\*/g, "**");
  // Step 3: Replace placeholder with *
  result = result.replace(/__PLUS__/g, "*");
  return result;
};

/**
 * Builds permission conditions for environment and secret path filtering.
 * Returns empty array if no restrictions are needed (matches everything).
 */
const buildConditions = (
  environment: string | null,
  secretPath: string | null
): PermissionCondition[] => {
  const conditions: PermissionCondition[] = [];

  // Add environment condition if present and not matching everything
  if (environment) {
    const globEnv = convertVaultWildcardToGlob(environment);
    // Skip if matches everything (Vault * becomes **)
    if (globEnv !== "**") {
      const hasWildcard = globEnv.includes("*");
      conditions.push({
        lhs: "environment",
        operator: hasWildcard
          ? PermissionConditionOperators.$GLOB
          : PermissionConditionOperators.$EQ,
        rhs: globEnv
      });
    }
  }

  // Add secret path condition if present and not matching everything
  if (secretPath && secretPath !== "/*") {
    const globPath = convertVaultWildcardToGlob(secretPath);
    // After conversion, /* becomes /** which matches everything
    if (globPath !== "/**") {
      const hasWildcard = globPath.includes("*");
      conditions.push({
        lhs: "secretPath",
        operator: hasWildcard
          ? PermissionConditionOperators.$GLOB
          : PermissionConditionOperators.$EQ,
        rhs: globPath
      });
    }
  }

  return conditions;
};

// ============================================================================
// Rule Deduplication
// ============================================================================

/**
 * Creates a unique key for deduplication of permission rules.
 * Combines all actions and conditions into a single string identifier.
 */
const createPermissionRuleKey = (rule: SecretPermissionRule | FolderPermissionRule): string => {
  const actions = Object.entries(rule)
    .filter(([key]) => key !== "conditions")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");

  const conditions = (rule.conditions || [])
    .map((c) => `${c.lhs}${c.operator}${c.rhs}`)
    .sort()
    .join("|");

  return `${actions}::${conditions}`;
};

/**
 * Adds a permission rule to the list if it's not a duplicate.
 */
const addPermissionRuleIfUnique = <T extends SecretPermissionRule | FolderPermissionRule>(
  rule: T,
  rulesList: T[],
  seenRules: Set<string>
): void => {
  const ruleKey = createPermissionRuleKey(rule);
  if (!seenRules.has(ruleKey)) {
    seenRules.add(ruleKey);
    rulesList.push(rule);
  }
};

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parses Vault HCL policy and converts it to Infisical permissions.
 *
 * Process:
 * 1. Clean HCL (remove comments, whitespace)
 * 2. Extract path blocks with regex
 * 3. For each path:
 *    - Parse to extract mount, environment, and secret path
 *    - Determine if it's a data path (secrets) or metadata path (folders)
 *    - Map Vault capabilities to Infisical actions
 *    - Build conditions for environment and path filtering
 *    - Create permission rule and add if unique
 *
 * @param hclPolicy - Raw Vault HCL policy string
 * @param mounts - List of Vault mounts to match paths against
 * @returns Parsed permissions object ready for Infisical role creation
 */
export const parseVaultPolicyToInfisical = (
  hclPolicy: string,
  mounts: VaultMount[]
): Partial<TFormSchema["permissions"]> => {
  const secretsPermissions: SecretPermissionRule[] = [];
  const foldersPermissions: FolderPermissionRule[] = [];

  const seenSecretRules = new Set<string>();
  const seenFolderRules = new Set<string>();

  try {
    // Step 1: Clean HCL policy - remove comments and extra whitespace
    const cleanedPolicy = hclPolicy
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line.length > 0)
      .join(" ");

    // Step 2: Extract path blocks using regex
    const pathRegex = /path\s+"([^"]+)"\s*\{[^}]*capabilities\s*=\s*\[([^\]]+)\][^}]*\}/gi;
    let match = pathRegex.exec(cleanedPolicy);

    // Step 3: Process each path block
    while (match !== null) {
      const [, path, capabilitiesStr] = match;

      // Parse capabilities list
      const capabilities = capabilitiesStr
        .split(",")
        .map((c) => c.trim().replace(/["'\s]/g, ""))
        .filter((c) => c.length > 0);

      // Parse the Vault path
      const { environment, secretPath, mount } = parseVaultPath(path, mounts);

      // Only process KV (Key-Value) secret engines
      if (mount && (mount.type === "kv" || mount.type === "generic")) {
        const isKvV2 = mount.version === "2";
        const isMetadata = isKvV2 && path.includes("/metadata/");

        if (isMetadata) {
          // Metadata paths → Folder permissions only (KV v2 metadata endpoint)
          const actions = mapVaultCapabilitiesToFolderActions(capabilities);
          if (Object.keys(actions).length > 0) {
            const conditions = buildConditions(environment, secretPath);
            addPermissionRuleIfUnique(
              { ...actions, conditions },
              foldersPermissions,
              seenFolderRules
            );
          }
        } else {
          // Data paths → Both secret AND folder permissions (KV v1 and v2 data paths)
          // Users need both to fully manage secrets and their containing folders
          const conditions = buildConditions(environment, secretPath);

          // Create secret permissions
          const secretActions = mapVaultCapabilitiesToSecretActions(capabilities);
          if (Object.keys(secretActions).length > 0) {
            addPermissionRuleIfUnique(
              { ...secretActions, conditions },
              secretsPermissions,
              seenSecretRules
            );
          }

          // Create folder permissions for create/update/delete capabilities
          const folderActions = mapVaultCapabilitiesToFolderActions(capabilities);
          if (Object.keys(folderActions).length > 0) {
            addPermissionRuleIfUnique(
              { ...folderActions, conditions },
              foldersPermissions,
              seenFolderRules
            );
          }
        }
      }

      match = pathRegex.exec(cleanedPolicy);
    }
  } catch (err) {
    console.error("Error parsing HCL policy:", err);
  }

  // Build final permissions object
  const permissions: Partial<TFormSchema["permissions"]> = {};
  if (secretsPermissions.length > 0) {
    permissions[ProjectPermissionSub.Secrets] = secretsPermissions;
  }
  if (foldersPermissions.length > 0) {
    permissions[ProjectPermissionSub.SecretFolders] = foldersPermissions;
  }

  return permissions;
};
