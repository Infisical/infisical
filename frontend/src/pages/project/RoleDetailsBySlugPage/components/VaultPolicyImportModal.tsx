import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent,
  TextArea
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  PermissionConditionOperators,
  ProjectPermissionSecretActions
} from "@app/context/ProjectPermissionContext/types";
import {
  useGetVaultMounts,
  useGetVaultNamespaces,
  useGetVaultPolicies
} from "@app/hooks/api/migration/queries";

import { TFormSchema } from "./ProjectRoleModifySection.utils";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onClose: () => void;
};

type VaultMount = { path: string; type: string; version: string | null };

// Extract array element type helper
type ArrayElement<T> = T extends (infer U)[] ? U : never;

// Extract permission rule types from the form schema
type SecretPermissionRule = ArrayElement<
  NonNullable<TFormSchema["permissions"]>[ProjectPermissionSub.Secrets]
>;
type FolderPermissionRule = ArrayElement<
  NonNullable<TFormSchema["permissions"]>[ProjectPermissionSub.SecretFolders]
>;

// Helper to parse Vault path and extract environment and secret path
const parseVaultPath = (
  vaultPath: string,
  mounts: VaultMount[]
): {
  environment: string | null;
  secretPath: string | null;
  mount: VaultMount | null;
  isWildcardMount: boolean;
} => {
  // Check if path starts with wildcard mount (e.g., "*/data/*")
  const isWildcardMount = vaultPath.startsWith("*/") || vaultPath.startsWith("+/");

  if (isWildcardMount) {
    // For wildcard mounts, extract everything after the wildcard prefix
    let remainingPath = vaultPath.slice(2); // Remove "*/" or "+/"
    if (remainingPath.startsWith("/")) remainingPath = remainingPath.slice(1);

    let environment: string | null = null;
    let secretPath: string | null = null;
    let isDataPath = false;
    let isMetadataPath = false;

    // Check for KV v2 data/ or metadata/ prefix
    if (remainingPath.startsWith("data/")) {
      isDataPath = true;
      remainingPath = remainingPath.slice(5); // Remove "data/"
    } else if (remainingPath.startsWith("metadata/")) {
      isMetadataPath = true;
      remainingPath = remainingPath.slice(9); // Remove "metadata/"
    }

    // Split remaining path into segments
    const segments = remainingPath.split("/").filter(Boolean);

    if (segments.length > 0) {
      // Special case: if the only segment is a wildcard, treat it as matching everything
      if (segments.length === 1 && (segments[0] === "*" || segments[0] === "+")) {
        environment = "*"; // Match all environments
        secretPath = "/*"; // Match all paths
      } else {
        // First segment is the environment
        [environment] = segments;

        // Remaining segments form the secret path
        if (segments.length > 1) {
          secretPath = `/${segments.slice(1).join("/")}`;
        } else {
          secretPath = "/";
        }
      }
    }

    // For wildcard mounts, return a synthetic mount object
    // We'll use this to determine if it's KV v2 (has data/metadata paths)
    const syntheticMount: VaultMount = {
      path: "*",
      type: "kv",
      version: isDataPath || isMetadataPath ? "2" : "1"
    };

    return { environment, secretPath, mount: syntheticMount, isWildcardMount: true };
  }

  // Original logic for non-wildcard paths
  // Find the matching mount for this path
  // Sort by path length (longest first) to match most specific mount
  const sortedMounts = [...mounts].sort((a, b) => b.path.length - a.path.length);
  const mount = sortedMounts.find((m) => vaultPath.startsWith(m.path));
  if (!mount) {
    return { environment: null, secretPath: null, mount: null, isWildcardMount: false };
  }

  // Remove mount prefix and any trailing slash
  let remainingPath = vaultPath.slice(mount.path.length);
  if (remainingPath.startsWith("/")) remainingPath = remainingPath.slice(1);

  // For KV v2, paths have format: data/{environment}/{path} or metadata/{environment}/{path}
  // For KV v1, paths have format: {environment}/{path}
  const isKvV2 = mount.version === "2" || mount.type === "kv";

  let environment: string | null = null;
  let secretPath: string | null = null;

  if (isKvV2) {
    // Remove data/ or metadata/ prefix for KV v2
    if (remainingPath.startsWith("data/")) {
      remainingPath = remainingPath.slice(5);
    } else if (remainingPath.startsWith("metadata/")) {
      remainingPath = remainingPath.slice(9);
    }
  }

  // Split remaining path into segments
  const segments = remainingPath.split("/").filter(Boolean);

  if (segments.length > 0) {
    // Special case: if the only segment is a wildcard, treat it as a path wildcard
    if (segments.length === 1 && (segments[0] === "*" || segments[0] === "+")) {
      environment = null; // No specific environment
      secretPath = "/*"; // Match all paths
    } else {
      // First segment is treated as the environment
      // (wildcards in environment will be handled with $GLOB operator later)
      [environment] = segments;

      // Remaining segments form the secret path
      if (segments.length > 1) {
        secretPath = `/${segments.slice(1).join("/")}`;
      } else {
        secretPath = "/";
      }
    }
  }

  return { environment, secretPath, mount, isWildcardMount: false };
};

// Helper to create a unique key for deduplication of permission rules
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

// HCL parser for Vault policies - converts Vault HCL to Infisical permissions
const parseVaultPolicyToInfisical = (
  hclPolicy: string,
  mounts: VaultMount[]
): Partial<TFormSchema["permissions"]> => {
  const permissions: Partial<TFormSchema["permissions"]> = {};
  const secretsPermissions: SecretPermissionRule[] = [];
  const foldersPermissions: FolderPermissionRule[] = [];

  const seenSecretRules = new Set<string>();
  const seenFolderRules = new Set<string>();

  try {
    // Remove comments from HCL before parsing
    const cleanedPolicy = hclPolicy
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim()) // Remove # comments
      .filter((line) => line.length > 0) // Remove empty lines
      .join(" "); // Join into single line for easier parsing

    // Match path blocks with flexible whitespace handling
    const pathRegex = /path\s+"([^"]+)"\s*\{[^}]*capabilities\s*=\s*\[([^\]]+)\][^}]*\}/gi;
    let match = pathRegex.exec(cleanedPolicy);

    while (match !== null) {
      const [, path, capabilitiesStr] = match;
      // Split by comma and clean up each capability (handles newlines, extra spaces, quotes)
      const capabilities = capabilitiesStr
        .split(",")
        .map((c) => c.trim().replace(/["'\s]/g, "")) // Remove quotes, spaces, newlines
        .filter((c) => c.length > 0); // Filter out empty strings

      // Parse the Vault path - handles both regular and wildcard mount paths
      const { environment, secretPath, mount } = parseVaultPath(path, mounts);

      // Only process KV (Key-Value) mounts
      if (mount && (mount.type === "kv" || mount.type === "generic")) {
        const isKvV2 = mount.version === "2";
        // For KV v2: explicit metadata paths are metadata, explicit data paths or paths without prefix are data
        // For KV v1: no metadata endpoint exists, everything is data
        const isMetadataPath = isKvV2 ? path.includes("/metadata/") : false;
        const isDataPath = !isMetadataPath; // Everything that's not metadata is a data path

        if (isDataPath && !isMetadataPath) {
          // Data paths map to secret permissions
          const actions: { [key: string]: boolean } = {};

          if (capabilities.includes("create"))
            actions[ProjectPermissionSecretActions.Create] = true;
          if (capabilities.includes("read")) {
            actions[ProjectPermissionSecretActions.DescribeSecret] = true;
            actions[ProjectPermissionSecretActions.ReadValue] = true;
          }
          if (capabilities.includes("update") || capabilities.includes("patch"))
            actions[ProjectPermissionSecretActions.Edit] = true;
          if (capabilities.includes("delete"))
            actions[ProjectPermissionSecretActions.Delete] = true;

          if (Object.keys(actions).length > 0) {
            const conditions: Array<{ lhs: string; operator: string; rhs: string }> = [];

            // Add environment condition with glob support if it contains wildcards
            if (environment) {
              // Convert Vault '+' to glob '*' for environment matching
              const globEnv = environment.replace(/\+/g, "*");
              // Skip condition if it's just '*' (matches everything = no restriction)
              if (globEnv !== "*") {
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

            // Add secret path condition with glob support
            if (secretPath && secretPath !== "/*") {
              // Convert Vault wildcards to picomatch glob patterns
              // Vault '*' = match within segment, picomatch '**' = match across segments
              // Vault '+' = single segment, convert to '*' (note: slightly more permissive)
              const globPath = secretPath.replace(/\+/g, "*");
              // Check if we need glob operator
              const hasWildcard = globPath.includes("*");
              conditions.push({
                lhs: "secretPath",
                operator: hasWildcard
                  ? PermissionConditionOperators.$GLOB
                  : PermissionConditionOperators.$EQ,
                rhs: globPath
              });
            }

            const newRule = {
              ...actions,
              conditions
            };

            // Check for duplicates before adding
            const ruleKey = createPermissionRuleKey(newRule);
            if (!seenSecretRules.has(ruleKey)) {
              seenSecretRules.add(ruleKey);
              secretsPermissions.push(newRule);
            }
          }
        } else if (isMetadataPath) {
          // Metadata paths map to folder permissions
          const actions: { [key: string]: boolean } = {};

          if (capabilities.includes("create")) actions[ProjectPermissionActions.Create] = true;
          if (capabilities.includes("update") || capabilities.includes("patch"))
            actions[ProjectPermissionActions.Edit] = true;
          if (capabilities.includes("delete")) actions[ProjectPermissionActions.Delete] = true;

          if (Object.keys(actions).length > 0) {
            const conditions: Array<{ lhs: string; operator: string; rhs: string }> = [];

            // Add environment condition with glob support if it contains wildcards
            if (environment) {
              // Convert Vault '+' to glob '*' for environment matching
              const globEnv = environment.replace(/\+/g, "*");
              // Skip condition if it's just '*' (matches everything = no restriction)
              if (globEnv !== "*") {
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

            // Add secret path condition for folders with glob support
            if (secretPath && secretPath !== "/*") {
              // Convert Vault '+' wildcard to glob '*'
              const globPath = secretPath.replace(/\+/g, "*");
              const hasWildcard = globPath.includes("*");
              conditions.push({
                lhs: "secretPath",
                operator: hasWildcard
                  ? PermissionConditionOperators.$GLOB
                  : PermissionConditionOperators.$EQ,
                rhs: globPath
              });
            }

            const newRule = {
              ...actions,
              conditions
            };

            // Check for duplicates before adding
            const ruleKey = createPermissionRuleKey(newRule);
            if (!seenFolderRules.has(ruleKey)) {
              seenFolderRules.add(ruleKey);
              foldersPermissions.push(newRule);
            }
          }
        }
      }

      match = pathRegex.exec(cleanedPolicy);
    }

    if (secretsPermissions.length > 0) {
      permissions[ProjectPermissionSub.Secrets] = secretsPermissions;
    }

    if (foldersPermissions.length > 0) {
      permissions[ProjectPermissionSub.SecretFolders] = foldersPermissions;
    }
  } catch (err) {
    console.error("Error parsing HCL policy:", err);
  }

  return permissions;
};

const Content = ({ onClose }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [hclPolicy, setHclPolicy] = useState<string>("");
  const [shouldFetchPolicies, setShouldFetchPolicies] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const { data: namespaces, isLoading: isLoadingNamespaces } = useGetVaultNamespaces();
  const { data: policies, isLoading: isLoadingPolicies } = useGetVaultPolicies(
    shouldFetchPolicies,
    selectedNamespace ?? undefined
  );
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined
  );

  // Enable fetching policies and mounts when namespace is selected
  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchPolicies(true);
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  // Auto-populate HCL when a policy is selected
  useEffect(() => {
    if (selectedPolicy && policies) {
      const policy = policies.find((p) => p.name === selectedPolicy);
      if (policy) {
        setHclPolicy(policy.rules);
      }
    }
  }, [selectedPolicy, policies]);

  const handleTranslateAndApply = () => {
    if (!hclPolicy.trim()) {
      createNotification({ type: "error", text: "Please provide a Vault HCL policy" });
      return;
    }

    if (!mounts || mounts.length === 0) {
      createNotification({
        type: "error",
        text: "No Vault mounts found. Please ensure you have KV secret engines configured."
      });
      return;
    }

    try {
      const parsedPermissions = parseVaultPolicyToInfisical(hclPolicy, mounts);

      if (!parsedPermissions || Object.keys(parsedPermissions).length === 0) {
        createNotification({
          type: "warning",
          text: "No translatable permissions found in the policy. Ensure the policy contains KV secret paths (e.g., secret/data/*, secret/metadata/*)."
        });
        return;
      }

      // Apply the parsed permissions to the form
      Object.entries(parsedPermissions).forEach(([subject, value]) => {
        if (!value) return;

        const subjectKey = subject as ProjectPermissionSub;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingValue = rootForm.getValues(`permissions.${subjectKey}`) as any;

        if (Array.isArray(existingValue) && existingValue.length > 0) {
          // Merge with existing permissions
          rootForm.setValue(
            `permissions.${subjectKey}`,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore-error
            [...existingValue, ...value],
            {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true
            }
          );
        } else {
          rootForm.setValue(
            `permissions.${subjectKey}`,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore-error
            value,
            {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true
            }
          );
        }
      });

      createNotification({
        type: "success",
        text: "Policy translated and applied successfully"
      });

      onClose();
    } catch (err) {
      console.error("Translation error:", err);
      createNotification({
        type: "error",
        text: "Failed to translate policy. Please check the HCL format."
      });
    }
  };

  return (
    <>
      <div className="bg-primary/10 text-mineshaft-200 mb-4 rounded-md p-3 text-sm">
        <div className="flex items-start gap-2">
          <FontAwesomeIcon icon={faInfoCircle} className="text-primary mt-0.5" />
          <div>
            <div className="mb-2">
              <strong>How Policy Translation Works</strong>
            </div>
            <div className="space-y-1.5 text-xs leading-relaxed">
              <p>
                Policies are translated by identifying KV secret engine mounts and parsing path
                structures to extract environments and secret paths.
              </p>
              <p>
                <strong>Key assumptions:</strong> The first path segment after the mount is treated
                as the environment (e.g., <code className="text-xs">secret/data/prod/app</code> →
                env: <code className="text-xs">prod</code>, path:{" "}
                <code className="text-xs">/app</code>). Vault capabilities and wildcards are
                automatically mapped to equivalent Infisical permissions and glob patterns.
              </p>
            </div>
          </div>
        </div>
      </div>

      <FormControl
        label="Namespace"
        className="mb-4"
        tooltipText="Required to fetch mount information. Policies will be intelligently translated using your Vault's KV secret engine mounts to extract environments and secret paths."
      >
        <>
          <FilterableSelect
            value={namespaces?.find((ns) => ns.id === selectedNamespace)}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const namespace = value as { id: string; name: string };
                setSelectedNamespace(namespace.name);
                setSelectedPolicy(null);
              }
            }}
            options={namespaces || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => (option.name === "/" ? "root" : option.name)}
            isDisabled={isLoadingNamespaces}
            placeholder="Select namespace..."
            className="w-full"
          />
          <p className="text-mineshaft-400 mt-1 text-xs">
            Select the Vault namespace to fetch policies and mount information
          </p>
        </>
      </FormControl>

      <FormControl label="Select Vault Policy (Optional)" className="mb-4">
        <>
          <FilterableSelect
            value={selectedPolicy ? policies?.find((p) => p.name === selectedPolicy) : null}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const policy = value as { name: string; rules: string };
                setSelectedPolicy(policy.name);
              } else {
                setSelectedPolicy(null);
              }
            }}
            options={policies || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => option.name}
            isDisabled={isLoadingPolicies}
            placeholder="Choose a policy to import..."
            isClearable
            className="w-full"
          />
          <p className="text-mineshaft-400 mt-1 text-xs">
            Select a policy to auto-populate the HCL editor below, or skip to paste your own
          </p>
        </>
      </FormControl>

      <FormControl label="Vault HCL Policy" className="mb-6">
        <>
          <TextArea
            value={hclPolicy}
            onChange={(e) => setHclPolicy(e.target.value)}
            placeholder={`path "secret/data/prod/app/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "secret/metadata/prod/*" {
  capabilities = ["list"]
}`}
            rows={12}
            className="font-mono text-sm"
          />
          <p className="text-mineshaft-400 mt-1 text-xs">
            Paste your HCL policy here or select one from the dropdown above. The translator will
            extract environments and paths automatically.
          </p>
        </>
      </FormControl>

      <div className="mt-8 flex space-x-4">
        <Button
          onClick={handleTranslateAndApply}
          isDisabled={!hclPolicy.trim() || isLoadingMounts || !mounts}
        >
          Translate & Apply
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};

export const VaultPolicyImportModal = ({ isOpen, onOpenChange }: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Import from HashiCorp Vault"
        subTitle="Select a policy from your Vault namespace or paste your own HCL policy to translate it into Infisical permissions."
        className="max-w-3xl"
      >
        <Content onClose={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
