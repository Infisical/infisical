import { useMemo, useState } from "react";

import type { AppConnectionPreset } from "@app/components/v4/patterns/app-connection-form";
import { Alert } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Field, FieldDescription, FieldLegend, FieldSet } from "@app/components/v4/ui/field";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { Snippet } from "@app/components/v4/ui/snippet";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { AzureKeyVaultConnectionMethod } from "@app/hooks/api/appConnections/types/azure-key-vault-connection";
import { DatabricksConnectionScope } from "@app/hooks/api/appConnections/types/databricks-connection";

import { useOrgId } from "../access/permissions";
import { useV4Adapter } from "../data/adapters";
import { CONNECTION_PRESETS } from "../data/integrations/connection-presets";
import { s3CompatiblePreset } from "../data/integrations/presets/cloud";
import { gitHubPreset } from "../data/integrations/presets/core";

/**
 * The app's preset with the parts main builds from server data: the organization's GitHub Apps and
 * the S3 Compatible hosts the server allows. Loading stays true until those arrive, because the
 * form reads its defaults and schema once.
 */
export const useConnectionPreset = (app: AppConnection | undefined, projectId?: string | null) => {
  const orgId = useOrgId();
  const gitHub = useV4Adapter("integrations").useGitHubApps(
    app === AppConnection.GitHub ? orgId : undefined,
    projectId
  );
  const config = useV4Adapter("admin").useServerConfig();
  const gitHubApps = gitHub.data;
  const hostnames = config.data?.allowedStorageHostnames;
  const preset = useMemo((): AppConnectionPreset | undefined => {
    if (app === AppConnection.S3Compatible) return s3CompatiblePreset(hostnames ?? []);
    if (app === AppConnection.GitHub) return gitHubPreset(gitHubApps ?? []);
    return app ? CONNECTION_PRESETS[app] : undefined;
  }, [app, gitHubApps, hostnames]);
  const loading =
    (app === AppConnection.GitHub && gitHub.isPending && !gitHub.error) ||
    (app === AppConnection.S3Compatible && config.isPending && !config.error);
  return { preset, loading };
};

/** Main's RotationConfirmation, asked before a save turns automatic rotation on. */
export const useRotationConfirmation = () => {
  const [resolve, setResolve] = useState<((confirmed: boolean) => void) | null>(null);
  const settle = (confirmed: boolean) => {
    resolve?.(confirmed);
    setResolve(null);
  };
  return {
    confirm: () =>
      new Promise<boolean>((done) => {
        setResolve(() => done);
      }),
    dialog: (
      <AlertDialog open={resolve !== null} onOpenChange={(next) => !next && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on automatic rotation?</AlertDialogTitle>
            <AlertDialogDescription>
              Infisical will rotate this credential on the schedule you set and revoke the one you
              entered, so you can no longer manage it yourself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                settle(true);
              }}
            >
              Turn on rotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  };
};

export const isManagedIdentity = (connection: Pick<TAppConnection, "app" | "method">) =>
  connection.app === AppConnection.AzureKeyVault &&
  connection.method === AzureKeyVaultConnectionMethod.ManagedIdentity;

type FederatedCredential = {
  issuerUrl: string | null;
  subjectIdentifier: string;
  audience: string;
};

export const federatedCredentialOf = (connection: TAppConnection) =>
  (connection.credentials as { federatedCredential?: FederatedCredential } | undefined)
    ?.federatedCredential;

/** What to add to the managed identity in Azure. The subject names the connection, so it exists first. */
export const FederatedCredentialDetails = ({
  credential
}: {
  credential: FederatedCredential | undefined;
}) => (
  <FieldSet>
    <FieldLegend>Federated credential</FieldLegend>
    <FieldDescription>
      Add a federated credential with these values to the managed identity in Azure, then verify the
      connection.
    </FieldDescription>
    {credential ? (
      <>
        {credential.issuerUrl ? (
          <Field label="Issuer">
            <Snippet label="Issuer" copyLabel="Copy issuer" value={credential.issuerUrl} />
          </Field>
        ) : (
          <Alert tone="bad" title="No issuer">
            The issuer is unavailable because SITE_URL is not set. Set it to this instance&apos;s
            public URL.
          </Alert>
        )}
        <Field label="Subject identifier">
          <Snippet
            label="Subject identifier"
            copyLabel="Copy subject identifier"
            value={credential.subjectIdentifier}
          />
        </Field>
        <Field label="Audience">
          <Snippet label="Audience" copyLabel="Copy audience" value={credential.audience} />
        </Field>
      </>
    ) : (
      <Alert tone="warn">The server didn&apos;t return the federated credential.</Alert>
    )}
  </FieldSet>
);

const SCOPE_OPTIONS = [
  {
    value: DatabricksConnectionScope.Secrets,
    label: DatabricksConnectionScope.Secrets,
    description: "Syncs secrets to Databricks secret scopes."
  },
  {
    value: DatabricksConnectionScope.Authentication,
    label: DatabricksConnectionScope.Authentication,
    description: "Creates and deletes service principal secrets during rotation."
  },
  {
    value: DatabricksConnectionScope.Scim,
    label: DatabricksConnectionScope.Scim,
    description: "Lists service principals when setting up a rotation."
  }
];

export const DatabricksScopesField = ({
  value,
  onChange,
  disabled
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) => (
  <Field
    label="Scopes"
    optional
    description="Leave empty to request all-apis, which allows every API the service principal can access."
  >
    <MultiSelect
      label="Scopes"
      placeholder="all-apis"
      options={SCOPE_OPTIONS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      quickActions={false}
    />
  </Field>
);

export const storedScopes = (connection: TAppConnection) =>
  connection.app === AppConnection.Databricks
    ? ((connection.credentials as { scopes?: string[] } | undefined)?.scopes ?? [])
    : [];
