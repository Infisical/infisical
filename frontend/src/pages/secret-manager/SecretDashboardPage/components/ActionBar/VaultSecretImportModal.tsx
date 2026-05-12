import { useEffect, useState } from "react";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { AppConnectionOption } from "@app/components/app-connections";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
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
  appConnections: TAvailableAppConnection[];
  onImport: (vaultPaths: string[], namespace: string, connectionId?: string) => void;
};

type ContentProps = {
  onClose: () => void;
  environment: string;
  secretPath: string;
  appConnections: TAvailableAppConnection[];
  onImport: (vaultPaths: string[], namespace: string, connectionId?: string) => void;
};

const Content = ({ onClose, environment, secretPath, appConnections, onImport }: ContentProps) => {
  const hasAppConnections = appConnections.length > 0;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [shouldFetchPaths, setShouldFetchPaths] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const activeConnectionId = hasAppConnections ? (selectedConnectionId ?? undefined) : undefined;

  const { data: namespaces, isLoading: isLoadingNamespaces } =
    useGetVaultNamespaces(activeConnectionId);
  const { data: secretPaths, isLoading: isLoadingPaths } = useGetVaultSecretPaths(
    shouldFetchPaths,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined,
    activeConnectionId
  );
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined,
    activeConnectionId
  );

  const kvMounts = mounts?.filter((mount) => mount.type === "kv" || mount.type.startsWith("kv"));

  useEffect(() => {
    setSelectedNamespace(null);
    setSelectedMountPath(null);
    setSelectedPaths([]);
    setShouldFetchMounts(false);
    setShouldFetchPaths(false);
  }, [selectedConnectionId]);

  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  useEffect(() => {
    if (selectedNamespace && selectedMountPath) {
      setShouldFetchPaths(true);
    } else {
      setShouldFetchPaths(false);
    }
  }, [selectedNamespace, selectedMountPath]);

  const handleImport = () => {
    if (!selectedPaths.length) {
      createNotification({
        type: "error",
        text: "Please select at least one Vault secret path to import"
      });
      return;
    }

    if (!selectedNamespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
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

    onImport(selectedPaths, selectedNamespace, activeConnectionId);
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

      {hasAppConnections && (
        <FormControl
          label="App Connection"
          className="mb-4"
          tooltipText="Select the HashiCorp Vault app connection to use for this import."
        >
          <>
            <FilterableSelect
              value={appConnections.find((conn) => conn.id === selectedConnectionId) ?? null}
              onChange={(value) => {
                if (value && !Array.isArray(value)) {
                  const conn = value as TAvailableAppConnection;
                  setSelectedConnectionId(conn.id);
                }
              }}
              options={appConnections}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
              placeholder="Select app connection..."
              className="w-full"
              components={{ Option: AppConnectionOption }}
            />
            <p className="mt-1 text-xs text-mineshaft-400">
              Project-scoped HashiCorp Vault app connections available to you
            </p>
          </>
        </FormControl>
      )}

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
              }
            }}
            options={namespaces || []}
            getOptionValue={(option) => option.name}
            getOptionLabel={(option) => (option.name === "/" ? "root" : option.name)}
            isDisabled={isLoadingNamespaces || (hasAppConnections && !selectedConnectionId)}
            placeholder={
              hasAppConnections && !selectedConnectionId
                ? "Select an app connection first..."
                : "Select namespace..."
            }
            className="w-full"
          />
          <p className="mt-1 text-xs text-mineshaft-400">
            Select the Vault namespace to fetch available mounts
          </p>
        </>
      </FormControl>

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

      <div className="mt-8 flex space-x-4">
        <Button
          onClick={handleImport}
          isDisabled={!selectedPaths.length || isLoadingMounts || isLoadingPaths}
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
  appConnections,
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
          appConnections={appConnections}
          onImport={onImport}
        />
      </ModalContent>
    </Modal>
  );
};
