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
import { parseVaultPolicyToInfisical } from "./VaultPolicyImportModal.utils";

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
