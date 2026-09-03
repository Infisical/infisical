import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { VaultCassandraImportModal } from "@app/components/external-migrations";
import { createNotification } from "@app/components/notifications";
import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import { ProjectPermissionSub, useProject } from "@app/context";
import { useCanUseProjectAppConnectionImport } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import type { VaultDatabaseRole } from "@app/hooks/api/migration/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { buildStatementFields, SslRejectUnauthorizedField, StatementAccordion } from "../shared";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFormMode
} from "../types";
import {
  CASSANDRA_CUSTOM_RENDERER_REASONS,
  cassandraCreateFormSchema,
  cassandraEditFormSchema,
  getCassandraCreateDefaultValues,
  getCassandraCreatePayload,
  getCassandraEditDefaultValues,
  getCassandraEditPayload,
  getCassandraVaultImportValues,
  TCassandraFormValues
} from "./cassandraContract";

const cassandraFields = [
  {
    name: "inputs.host",
    type: "text",
    label: "Host",
    placeholder: "cassandra-1.example.com,cassandra-2.example.com",
    layout: "half"
  },
  { name: "inputs.port", type: "number", label: "Port", layout: "half" },
  {
    name: "inputs.localDataCenter",
    type: "text",
    label: "Local Data Center",
    placeholder: "datacenter1"
  },
  {
    name: "inputs.username",
    type: "text",
    label: "User",
    placeholder: "cassandra",
    layout: "half",
    autoComplete: "off"
  },
  {
    name: "inputs.password",
    type: "secret",
    label: "Password",
    placeholder: "Enter database password",
    layout: "half",
    autoComplete: "new-password"
  },
  {
    name: "inputs.keyspace",
    type: "text",
    label: "Keyspace",
    placeholder: "app_keyspace",
    isOptional: true
  },
  {
    name: "inputs.ca",
    type: "textarea",
    label: "CA (SSL)",
    placeholder: "-----BEGIN CERTIFICATE----- ...",
    isOptional: true,
    rows: 3
  }
] satisfies readonly TDynamicSecretProviderField<TCassandraFormValues>[];

const advancedFields = buildStatementFields<TCassandraFormValues>({
  renewOptional: false,
  copy: {
    creation:
      "Variables: keyspace, username, password, and expiration are dynamically provisioned.",
    revocation: "Variables: keyspace and username are dynamically provisioned.",
    renew: "Variables: keyspace, username, and expiration are dynamically provisioned."
  }
});

const CassandraVaultImport = ({ onImport }: { onImport: (role: VaultDatabaseRole) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { projectId } = useProject();
  const canImport = useCanUseProjectAppConnectionImport(ProjectPermissionSub.Secrets);
  const { data: appConnections = [] } = useListAvailableAppConnections(
    AppConnection.HCVault,
    projectId,
    { enabled: canImport }
  );

  if (!canImport || appConnections.length === 0) return null;

  return (
    <>
      <Alert variant="info">
        <InfoIcon />
        <AlertDescription>
          <span>Load values from HashiCorp Vault.</span>
          <AlertAction>
            <Button type="button" size="sm" variant="info" onClick={() => setIsOpen(true)}>
              <img src="/images/integrations/Vault.png" alt="" className="size-4" />
              Load from Vault
            </Button>
          </AlertAction>
        </AlertDescription>
      </Alert>
      <VaultCassandraImportModal
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        appConnections={appConnections}
        onImport={onImport}
      />
    </>
  );
};

const CassandraFields = ({ mode }: { mode: TDynamicSecretProviderFormMode }) => {
  const { setValue } = useFormContext<TCassandraFormValues>();

  const handleVaultImport = (role: VaultDatabaseRole) => {
    try {
      const imported = getCassandraVaultImportValues(role);
      setValue("name", imported.name);
      if (imported.defaultTTL) setValue("defaultTTL", imported.defaultTTL);
      if (imported.maxTTL) setValue("maxTTL", imported.maxTTL);
      if (imported.inputs.host) setValue("inputs.host", imported.inputs.host);
      setValue("inputs.port", imported.inputs.port);
      if (imported.inputs.username) setValue("inputs.username", imported.inputs.username);
      if (imported.inputs.ca) setValue("inputs.ca", imported.inputs.ca);
      if (imported.inputs.creationStatement) {
        setValue("inputs.creationStatement", imported.inputs.creationStatement);
      }
      if (imported.inputs.revocationStatement) {
        setValue("inputs.revocationStatement", imported.inputs.revocationStatement);
      }
      if (imported.inputs.renewStatement) {
        setValue("inputs.renewStatement", imported.inputs.renewStatement);
      }
      createNotification({
        type: "info",
        text: "Configuration loaded successfully from HashiCorp Vault"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to load configuration from HashiCorp Vault"
      });
    }
  };

  return (
    <>
      {mode === "create" && <CassandraVaultImport onImport={handleVaultImport} />}
      <DynamicSecretProviderGroup id="cassandra-connection" presentation="panel">
        <DynamicSecretProviderFields fields={cassandraFields} />
        <SslRejectUnauthorizedField />
      </DynamicSecretProviderGroup>
      <StatementAccordion title="Modify CQL Statements" fields={advancedFields} value="advanced" />
    </>
  );
};

export const cassandraDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Cassandra,
  label: "Cassandra",
  customRenderer: {
    reasons: CASSANDRA_CUSTOM_RENDERER_REASONS,
    Component: CassandraFields
  },
  create: {
    schema: cassandraCreateFormSchema,
    getDefaultValues: getCassandraCreateDefaultValues,
    toPayload: getCassandraCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: cassandraEditFormSchema,
    getDefaultValues: getCassandraEditDefaultValues,
    toPayload: getCassandraEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
