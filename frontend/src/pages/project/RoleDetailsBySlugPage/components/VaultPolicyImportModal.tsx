import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Combobox,
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  OrgIcon,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SubOrgIcon,
  TextArea
} from "@app/components/v3";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
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
  appConnections: TAvailableAppConnection[];
};

type ContentProps = {
  onClose: () => void;
  appConnections: TAvailableAppConnection[];
};

const defaultVaultConnectionId = (appConnections: TAvailableAppConnection[]) =>
  appConnections.length === 1 ? appConnections[0].id : null;

const Content = ({ onClose, appConnections }: ContentProps) => {
  const rootForm = useFormContext<TFormSchema>();
  const hasAppConnections = appConnections.length > 0;
  const { isSubOrganization } = useOrganization();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    defaultVaultConnectionId(appConnections)
  );
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [hclPolicy, setHclPolicy] = useState<string>("");
  const [shouldFetchPolicies, setShouldFetchPolicies] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    blocks: PolicyBlock[];
    lines: PolicyLine[];
  } | null>(null);

  const activeConnectionId = hasAppConnections ? (selectedConnectionId ?? undefined) : undefined;
  const needsConnection = hasAppConnections && !selectedConnectionId;

  const { data: namespaces, isLoading: isLoadingNamespaces } =
    useGetVaultNamespaces(activeConnectionId);

  const { data: policies, isLoading: isLoadingPolicies } = useGetVaultPolicies(
    shouldFetchPolicies,
    selectedNamespace ?? undefined,
    activeConnectionId
  );
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined,
    activeConnectionId
  );

  const handleConnectionChange = (id: string) => {
    setSelectedConnectionId(id);
    setSelectedNamespace(null);
    setSelectedPolicy(null);
    setHclPolicy("");
    setAnalysisResult(null);
    setShouldFetchMounts(false);
    setShouldFetchPolicies(false);
  };

  const handleNamespaceChange = (ns: string) => {
    setSelectedNamespace(ns);
    setSelectedPolicy(null);
  };

  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchPolicies(true);
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  useEffect(() => {
    if (selectedPolicy && policies) {
      const policy = policies.find((p) => p.name === selectedPolicy);
      if (policy) {
        setHclPolicy(policy.rules);
      }
    }
  }, [selectedPolicy, policies]);

  useEffect(() => {
    if (!hclPolicy.trim() || !mounts || mounts.length === 0) {
      setAnalysisResult(null);
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      const result = analyzeVaultPolicy(hclPolicy, mounts);
      setAnalysisResult(result);
    }, 300);

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
          <p className="font-medium text-warning">No KV mounts found</p>
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

    if (hasAppConnections && !selectedConnectionId) {
      createNotification({ type: "error", text: "Please select an app connection" });
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

      (Object.keys(parsedPermissions) as ProjectPermissionSub[]).forEach((subjectKey) => {
        const value = parsedPermissions[subjectKey];
        if (!value) return;

        const existingValue = rootForm.getValues(`permissions.${subjectKey}`) as unknown[];

        if (Array.isArray(existingValue) && existingValue.length > 0) {
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
      <div className="min-h-0 thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        <Alert variant="info">
          <InfoIcon />
          <AlertTitle>How Policy Translation Works</AlertTitle>
          <AlertDescription>
            <div className="space-y-1.5">
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
          </AlertDescription>
        </Alert>

        {hasAppConnections && (
          <Field>
            <FieldLabel htmlFor="vault-app-connection">App Connection</FieldLabel>
            <Combobox
              id="vault-app-connection"
              value={
                appConnections.find((connection) => connection.id === selectedConnectionId) ?? null
              }
              onValueChange={(connection) => handleConnectionChange(connection.id)}
              options={appConnections}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              placeholder="Select app connection..."
              searchPlaceholder="Search app connections..."
              searchAriaLabel="Search app connections"
              emptyMessage="No app connections found."
              modal
              renderOption={(option) => (
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate">{option.name}</span>
                  {!option.projectId && (
                    <Badge variant={isSubOrganization ? "sub-org" : "org"}>
                      {isSubOrganization ? <SubOrgIcon /> : <OrgIcon />}
                      {isSubOrganization ? "Sub-Organization" : "Organization"}
                    </Badge>
                  )}
                </div>
              )}
            />
            <FieldDescription>
              HashiCorp Vault app connections available to you in this project.
            </FieldDescription>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="vault-namespace">Namespace</FieldLabel>
          <Combobox
            id="vault-namespace"
            value={namespaces?.find((namespace) => namespace.name === selectedNamespace) ?? null}
            onValueChange={(namespace) => handleNamespaceChange(namespace.name)}
            options={namespaces ?? []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => (option.name === "/" ? "root" : option.name)}
            isDisabled={isLoadingNamespaces || needsConnection}
            isLoading={isLoadingNamespaces}
            placeholder={
              needsConnection ? "Select an app connection first..." : "Select namespace..."
            }
            searchPlaceholder="Search namespaces..."
            searchAriaLabel="Search Vault namespaces"
            emptyMessage="No Vault namespaces found."
            modal
          />
          <FieldDescription>
            Select the Vault namespace used to fetch policies and KV mount information for the
            translation.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="vault-policy">Select Vault Policy (Optional)</FieldLabel>
          <Combobox
            id="vault-policy"
            value={
              selectedPolicy ? (policies?.find((p) => p.name === selectedPolicy) ?? null) : null
            }
            onValueChange={(policy) => setSelectedPolicy(policy.name)}
            onClear={() => setSelectedPolicy(null)}
            options={policies ?? []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => option.name}
            isDisabled={isLoadingPolicies}
            isLoading={isLoadingPolicies}
            placeholder="Choose a policy to import..."
            searchPlaceholder="Search Vault policies..."
            searchAriaLabel="Search Vault policies"
            clearAriaLabel="Clear Vault policy"
            emptyMessage="No Vault policies found."
            modal
          />
          <FieldDescription>
            Select a policy to auto-populate the HCL editor below, or skip to paste your own policy.
          </FieldDescription>
        </Field>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="vault-hcl-policy">Vault HCL Policy</FieldLabel>
            <TextArea
              id="vault-hcl-policy"
              value={hclPolicy}
              onChange={(e) => setHclPolicy(e.target.value)}
              placeholder={`path "secret/data/prod/app/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "secret/metadata/prod/*" {
  capabilities = ["list"]
}`}
              rows={20}
              className="h-80 resize-none px-4 py-2 font-mono text-xs leading-6 xl:h-[30rem]"
            />
            <FieldDescription>
              Paste your HCL policy here or select one from the dropdown above.
            </FieldDescription>
          </Field>

          <Field>
            <FieldTitle>Translation Preview</FieldTitle>
            {analysisResult ? (
              <VaultPolicyPreview blocks={analysisResult.blocks} lines={analysisResult.lines} />
            ) : (
              <div className="flex h-80 items-center justify-center rounded-md border border-border bg-container p-4 text-center text-sm text-muted xl:h-[30rem]">
                {renderEmptyState()}
              </div>
            )}
          </Field>
        </div>
      </div>

      <SheetFooter className="justify-end border-t">
        <SheetClose asChild>
          <Button variant="ghost">Cancel</Button>
        </SheetClose>
        <Button
          variant="project"
          onClick={handleTranslateAndApply}
          isDisabled={!hclPolicy.trim() || isLoadingMounts || !mounts}
        >
          Translate & Apply
        </Button>
      </SheetFooter>
    </>
  );
};

export const VaultPolicyImportModal = ({ isOpen, onOpenChange, appConnections }: Props) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-[calc(100vw-2rem)] sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>Import from HashiCorp Vault</SheetTitle>
          <SheetDescription>
            Select a policy from your Vault namespace or paste your own HCL policy to translate it
            into Infisical permissions.
          </SheetDescription>
        </SheetHeader>
        <Content onClose={() => onOpenChange(false)} appConnections={appConnections} />
      </SheetContent>
    </Sheet>
  );
};
