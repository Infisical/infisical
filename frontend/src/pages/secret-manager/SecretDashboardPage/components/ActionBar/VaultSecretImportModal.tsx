import { useEffect, useState } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  TextArea
} from "@app/components/v2";
import {
  useGetVaultMounts,
  useGetVaultNamespaces,
  useGetVaultSecretPaths
} from "@app/hooks/api/migration/queries";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environment: string;
  secretPath: string;
  onImport: (
    vaultPaths: string[],
    namespace: string,
    options?: { mountPath: string; kvVersion: "1" | "2" }
  ) => void;
};

type ContentProps = {
  onClose: () => void;
  environment: string;
  secretPath: string;
  onImport: (
    vaultPaths: string[],
    namespace: string,
    options?: { mountPath: string; kvVersion: "1" | "2" }
  ) => void;
};

const KV_VERSION_OPTIONS: Array<{ label: string; value: "1" | "2" }> = [
  { label: "KV v2", value: "2" },
  { label: "KV v1", value: "1" }
];

const normalizeVaultPath = (path: string) => path.trim().replace(/^\/+|\/+$/g, "");

const parseManualSecretPaths = (value: string) =>
  value
    .split(/[\n,]+/)
    .map(normalizeVaultPath)
    .filter(Boolean);

const Content = ({ onClose, environment, secretPath, onImport }: ContentProps) => {
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [shouldFetchPaths, setShouldFetchPaths] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [manualMountPath, setManualMountPath] = useState("");
  const [manualKvVersion, setManualKvVersion] = useState<"1" | "2">("2");
  const [manualSecretPaths, setManualSecretPaths] = useState("");

  const { data: namespaces, isLoading: isLoadingNamespaces } = useGetVaultNamespaces();
  const { data: secretPaths, isLoading: isLoadingPaths } = useGetVaultSecretPaths(
    shouldFetchPaths,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined
  );
  const {
    data: mounts,
    isLoading: isLoadingMounts,
    isError: isMountsError
  } = useGetVaultMounts(shouldFetchMounts, selectedNamespace ?? undefined);

  // Filter to only show KV mounts
  const kvMounts = mounts?.filter((mount) => mount.type === "kv" || mount.type.startsWith("kv"));
  const manualPathEntries = parseManualSecretPaths(manualSecretPaths);
  const normalizedManualMountPath = normalizeVaultPath(manualMountPath);

  // Enable fetching mounts when namespace is selected
  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  // Enable fetching paths when both namespace and mount path are selected
  useEffect(() => {
    if (selectedNamespace && selectedMountPath) {
      setShouldFetchPaths(true);
    } else {
      setShouldFetchPaths(false);
    }
  }, [selectedNamespace, selectedMountPath]);

  useEffect(() => {
    if (isMountsError) {
      setIsManualEntry(true);
    }
  }, [isMountsError]);

  const handleImport = () => {
    if (!selectedNamespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }

    if (isManualEntry) {
      if (!normalizedManualMountPath) {
        createNotification({ type: "error", text: "Please enter a Vault secrets engine path" });
        return;
      }

      if (!manualPathEntries.length) {
        createNotification({
          type: "error",
          text: "Please enter at least one Vault secret path to import"
        });
        return;
      }

      const vaultPaths = manualPathEntries.map((path) =>
        path === normalizedManualMountPath || path.startsWith(`${normalizedManualMountPath}/`)
          ? path
          : `${normalizedManualMountPath}/${path}`
      );

      onImport(vaultPaths, selectedNamespace, {
        mountPath: normalizedManualMountPath,
        kvVersion: manualKvVersion
      });
      onClose();
      return;
    }

    if (!selectedPaths.length) {
      createNotification({
        type: "error",
        text: "Please select at least one Vault secret path to import"
      });
      return;
    }

    const selectedMount = kvMounts?.find(
      (mount) => mount.path.replace(/\/$/, "") === selectedMountPath
    );

    if (!selectedMountPath || !selectedMount) {
      createNotification({
        type: "error",
        text: "Please select a Vault secrets engine"
      });
      return;
    }

    onImport(selectedPaths, selectedNamespace, {
      mountPath: selectedMountPath,
      kvVersion: selectedMount.version === "2" ? "2" : "1"
    });
    onClose();
  };

  return (
    <>
      <div className="mb-4 rounded-md bg-primary/10 p-3 text-sm text-mineshaft-200">
        <div className="flex items-start gap-2">
          <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-primary" />
          <div>
            <div className="mb-2">
              <strong>Import Secrets from HashiCorp Vault</strong>
            </div>
            <div className="space-y-1.5 text-xs leading-relaxed">
              <p>
                Select a Vault namespace and one or more secret paths to import secrets into the
                current Infisical environment (<code className="text-xs">{environment}</code>) at
                path <code className="text-xs">{secretPath}</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <FormControl
        label="Namespace"
        className="mb-4"
        tooltipText="Select the Vault namespace containing the secrets you want to import."
      >
        <>
          <FilterableSelect
            value={namespaces?.find((ns) => ns.name === selectedNamespace)}
            onChange={(value) => {
              if (value && !Array.isArray(value)) {
                const namespace = value as { id: string; name: string };
                setSelectedNamespace(namespace.name);
                setSelectedMountPath(null);
                setSelectedPaths([]);
                setManualMountPath("");
                setManualSecretPaths("");
                setIsManualEntry(false);
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
            Select the Vault namespace to fetch available mounts
          </p>
        </>
      </FormControl>

      <div className="mb-4 flex items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800/50 p-3">
        <div className="text-sm text-mineshaft-200">
          {isMountsError
            ? "Vault mount discovery is unavailable for this token."
            : "Need to import without listing Vault mounts?"}
        </div>
        <Button
          type="button"
          colorSchema="secondary"
          variant="outline_bg"
          onClick={() => {
            setIsManualEntry((isEnabled) => !isEnabled);
            setSelectedMountPath(null);
            setSelectedPaths([]);
          }}
        >
          {isManualEntry ? "Use discovered paths" : "Enter paths manually"}
        </Button>
      </div>

      {isManualEntry ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
            <FormControl
              label="Secrets Engine Path"
              tooltipText="Enter the Vault KV secrets engine mount path."
            >
              <Input
                value={manualMountPath}
                onChange={(e) => setManualMountPath(e.target.value)}
                placeholder="secret"
              />
            </FormControl>

            <FormControl label="KV Version">
              <FilterableSelect
                value={KV_VERSION_OPTIONS.find((option) => option.value === manualKvVersion)}
                onChange={(value) => {
                  if (value && !Array.isArray(value)) {
                    setManualKvVersion((value as { value: "1" | "2" }).value);
                  }
                }}
                options={KV_VERSION_OPTIONS}
                getOptionValue={(option) => option.value}
                getOptionLabel={(option) => option.label}
                className="w-full"
              />
            </FormControl>
          </div>

          <FormControl
            label="Vault Secret Paths"
            className="mb-6"
            tooltipText="Enter one Vault secret path per line, relative to the selected secrets engine."
          >
            <TextArea
              value={manualSecretPaths}
              onChange={(e) => setManualSecretPaths(e.target.value)}
              placeholder={"app/config\napp/database"}
              rows={6}
              reSize="vertical"
            />
          </FormControl>
        </>
      ) : (
        <>
          <FormControl
            label="Secrets Engine"
            className="mb-4"
            tooltipText="Select the KV secrets engine to narrow down secret paths."
          >
            <>
              <FilterableSelect
                value={kvMounts?.find((mount) => mount.path === selectedMountPath)}
                onChange={(value) => {
                  if (value && !Array.isArray(value)) {
                    const mount = value as { path: string; type: string; version: string | null };
                    setSelectedMountPath(mount.path.replace(/\/$/, "")); // Remove trailing slash
                    setSelectedPaths([]);
                  }
                }}
                options={kvMounts || []}
                getOptionValue={(option) => option.path}
                getOptionLabel={(option) => option.path.replace(/\/$/, "")}
                isDisabled={isLoadingMounts || !kvMounts?.length}
                placeholder="Select secrets engine..."
                className="w-full"
              />
              <p className="mt-1 text-xs text-mineshaft-400">
                Choose a KV secrets engine to filter available secret paths
              </p>
            </>
          </FormControl>

          <FormControl label="Vault Secret Path" className="mb-6">
            <>
              <FilterableSelect
                isMulti
                value={selectedPaths.map((path) => ({ path }))}
                onChange={(value) => {
                  if (!value) {
                    setSelectedPaths([]);
                  } else if (Array.isArray(value)) {
                    setSelectedPaths(value.map((option) => option.path));
                  }
                }}
                options={(secretPaths || []).map((path) => ({ path }))}
                getOptionValue={(option) => option.path}
                getOptionLabel={(option) => option.path}
                isDisabled={isLoadingPaths || !secretPaths?.length || !selectedMountPath}
                placeholder={
                  !selectedMountPath
                    ? "Select a mount path first..."
                    : "Select Vault path(s) to import..."
                }
                isClearable
                className="w-full"
              />
              <p className="mt-1 text-xs text-mineshaft-400">
                Choose one or more secret paths from the selected mount to import into Infisical
              </p>
            </>
          </FormControl>
        </>
      )}

      <div className="mt-8 flex space-x-4">
        <Button
          onClick={handleImport}
          isDisabled={
            isManualEntry
              ? !selectedNamespace || !normalizedManualMountPath || !manualPathEntries.length
              : !selectedPaths.length || isLoadingMounts || isLoadingPaths
          }
        >
          Import Secrets
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

export const VaultSecretImportModal = ({
  isOpen,
  onOpenChange,
  environment,
  secretPath,
  onImport
}: Props) => {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Import from HashiCorp Vault"
        subTitle="Select a Vault namespace and one or more secret paths to import secrets into the current environment and folder."
        className="max-w-2xl"
      >
        <Content
          onClose={() => onOpenChange(false)}
          environment={environment}
          secretPath={secretPath}
          onImport={onImport}
        />
      </ModalContent>
    </Modal>
  );
};
