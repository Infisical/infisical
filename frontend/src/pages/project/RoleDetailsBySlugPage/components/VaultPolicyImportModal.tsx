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
import { ProjectPermissionSub } from "@app/context";
import {
  useGetVaultMounts,
  useGetVaultNamespaces,
  useGetVaultPolicies
} from "@app/hooks/api/migration/queries";

import { TFormSchema } from "./ProjectRoleModifySection.utils";
import { analyzeVaultPolicy, PolicyBlock, PolicyLine } from "./VaultPolicyAnalyzer.utils";
import { parseVaultPolicyToInfisical } from "./VaultPolicyImportModal.utils";
import { VaultPolicyPreview } from "./VaultPolicyPreview";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onClose: () => void;
};

const Content = ({ onClose }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [hclPolicy, setHclPolicy] = useState<string>("");
  const [shouldFetchPolicies, setShouldFetchPolicies] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    blocks: PolicyBlock[];
    lines: PolicyLine[];
  } | null>(null);

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

  // Automatically analyze policy when it changes (with debouncing)
  useEffect(() => {
    if (!hclPolicy.trim() || !mounts || mounts.length === 0) {
      setAnalysisResult(null);
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      const result = analyzeVaultPolicy(hclPolicy, mounts);
      setAnalysisResult(result);
    }, 300); // Debounce for 300ms

    return () => {
      clearTimeout(timeoutId);
    };
  }, [hclPolicy, mounts]);

  const renderEmptyState = () => {
    if (!selectedNamespace) {
      return (
        <div>
          <p>Select a namespace to enable preview</p>
        </div>
      );
    }

    if (isLoadingMounts) {
      return <div>Loading mounts...</div>;
    }

    if (!mounts || mounts.length === 0) {
      return (
        <div>
          <p className="font-medium text-yellow-400">No KV mounts found</p>
          <p className="mt-1 text-xs">This namespace has no KV secret engines configured.</p>
          <p className="mt-1 text-xs">Policy translation requires KV mounts.</p>
        </div>
      );
    }

    return <div>Enter a policy to see translation preview</div>;
  };

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
      (Object.keys(parsedPermissions) as ProjectPermissionSub[]).forEach((subjectKey) => {
        const value = parsedPermissions[subjectKey];
        if (!value) return;

        const existingValue = rootForm.getValues(`permissions.${subjectKey}`) as unknown[];

        if (Array.isArray(existingValue) && existingValue.length > 0) {
          // Merge with existing permissions
          rootForm.setValue(`permissions.${subjectKey}`, [...existingValue, ...value] as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true
          });
        } else {
          rootForm.setValue(`permissions.${subjectKey}`, value as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true
          });
        }
      });

      createNotification({
        type: "info",
        text: "Vault policy translated and prefilled"
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
      <div className="mb-4 rounded-md bg-primary/10 p-3 text-sm text-mineshaft-200">
        <div className="flex items-start gap-2">
          <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-primary" />
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
        tooltipText="Required to fetch mount information. Policies will be translated using your Vault's KV secret engine mounts to extract environments and secret paths."
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
          <p className="mt-1 text-xs text-mineshaft-400">
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
          <p className="mt-1 text-xs text-mineshaft-400">
            Select a policy to auto-populate the HCL editor below, or skip to paste your own
          </p>
        </>
      </FormControl>

      <div className="grid grid-cols-2 gap-4">
        <FormControl label="Vault HCL Policy" className="mb-4">
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
              rows={20}
              className="h-[30rem] px-4 py-0.5 font-mono text-xs leading-6"
            />
            <p className="mt-1 text-xs text-mineshaft-400">
              Paste your HCL policy here or select one from the dropdown above.
            </p>
          </>
        </FormControl>

        <div className="mb-4">
          <FormControl label="Translation Preview" className="mb-4">
            {analysisResult ? (
              <VaultPolicyPreview blocks={analysisResult.blocks} lines={analysisResult.lines} />
            ) : (
              <div className="flex h-[30rem] items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-900 text-center text-sm text-mineshaft-400">
                {renderEmptyState()}
              </div>
            )}
          </FormControl>
        </div>
      </div>

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
        className="max-w-4xl"
      >
        <Content onClose={() => onOpenChange(false)} />
      </ModalContent>
    </Modal>
  );
};
