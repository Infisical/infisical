import { useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { Field, FieldDescription, FieldLegend, FieldSet } from "@infisical/cipher/ui/field";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { Select } from "@infisical/cipher/ui/select";
import { Snippet } from "@infisical/cipher/ui/snippet";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { DatabricksConnectionScope } from "@app/hooks/api/appConnections/types/databricks-connection";
import type { AppConnectionPreset } from "@app/pages/v4/components/app-connection-form";

import { useOrgId } from "../access/permissions";
import { useV4Adapter } from "../data/adapters";
import { CONNECTION_PRESETS } from "../data/integrations/connection-presets";
import { s3CompatiblePreset } from "../data/integrations/presets/cloud";
import { gitHubPreset } from "../data/integrations/presets/core";
import {
  editedWorkloadIdentityProvider,
  parseWorkloadIdentityProvider
} from "../data/integrations/presets/gcp-workload-identity";
import { type FederatedCredential, federatedCredentialOf } from "./app-connection-model";

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

/** What to add to the managed identity in Azure. The subject names the connection, so it exists first. */
const FederatedCredentialDetails = ({
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

enum BindingScope {
  Connection = "connection",
  Project = "project"
}

const BINDING_SCOPE_OPTIONS = [
  { value: BindingScope.Connection, label: "This connection only" },
  { value: BindingScope.Project, label: "Any connection in this Infisical project" }
];

const PROJECT_ID_PLACEHOLDER = "<GCP_PROJECT_ID>";

/**
 * Main's GCP setup: the federated credential, then gcloud commands for the pool, the provider and
 * the binding. It follows the form's unsaved edits, so GCP can be set up for a new target before
 * the connection is verified with it.
 */
const GcpWorkloadIdentitySetup = ({
  connection,
  editedCredentials
}: {
  connection: TAppConnection;
  editedCredentials?: Record<string, unknown>;
}) => {
  const [bindingScope, setBindingScope] = useState(BindingScope.Connection);
  const credential = federatedCredentialOf(connection);
  const stored = connection.credentials as {
    workloadIdentityProvider: string;
    serviceAccountEmail?: string;
  };
  const savedServiceAccountEmail = stored.serviceAccountEmail || undefined;
  const workloadIdentityProvider =
    editedWorkloadIdentityProvider(editedCredentials) ?? stored.workloadIdentityProvider;
  const editedEmail = editedCredentials?.serviceAccountEmail as string | undefined;
  const serviceAccountEmail =
    editedEmail === undefined ? savedServiceAccountEmail : editedEmail.trim() || undefined;
  const isEdited =
    workloadIdentityProvider !== stored.workloadIdentityProvider ||
    serviceAccountEmail !== savedServiceAccountEmail;
  const provider = parseWorkloadIdentityProvider(workloadIdentityProvider);
  const { projectId } = connection;
  const scope = projectId ? bindingScope : BindingScope.Connection;

  if (!credential)
    return <Alert tone="warn">The server didn&apos;t return the federated credential.</Alert>;

  const { issuerUrl, subjectIdentifier } = credential;
  const audience =
    workloadIdentityProvider === stored.workloadIdentityProvider
      ? credential.audience
      : `https://iam.googleapis.com/${workloadIdentityProvider}`;
  const poolPath =
    provider &&
    `projects/${provider.projectNumber}/locations/global/workloadIdentityPools/${provider.poolId}`;
  const member =
    poolPath &&
    (scope === BindingScope.Project
      ? `principalSet://iam.googleapis.com/${poolPath}/attribute.project_id/${projectId}`
      : `principal://iam.googleapis.com/${poolPath}/subject/${subjectIdentifier}`);

  return (
    <FieldSet>
      <FieldLegend>Federated credential</FieldLegend>
      <FieldDescription>
        {isEdited
          ? "These values use the credentials you entered, which are saved once verification succeeds. Configure GCP with them, then verify the connection."
          : "Configure GCP with these values, then verify the connection."}
      </FieldDescription>
      {issuerUrl ? (
        <Field label="Issuer">
          <Snippet label="Issuer" copyLabel="Copy issuer" value={issuerUrl} />
        </Field>
      ) : (
        <Alert tone="bad" title="No issuer">
          The issuer is unavailable because SITE_URL is not set. Set it to this instance&apos;s
          public HTTPS URL, which GCP must be able to reach.
        </Alert>
      )}
      <Field label="Subject identifier">
        <Snippet
          label="Subject identifier"
          copyLabel="Copy subject identifier"
          value={subjectIdentifier}
        />
      </Field>
      <Field label="Audience">
        <Snippet label="Audience" copyLabel="Copy audience" value={audience} />
      </Field>
      {provider && member && (
        <FieldSet>
          <FieldLegend>Setup commands</FieldLegend>
          <FieldDescription>
            Run these with the gcloud CLI. Replace {PROJECT_ID_PLACEHOLDER} with the ID of the
            project whose number is {provider.projectNumber}.
          </FieldDescription>
          <CodeBlock
            label="Create the pool, if it doesn't exist"
            language="shell"
            wrap
            code={[
              `gcloud iam workload-identity-pools create ${provider.poolId} \\`,
              `  --project ${PROJECT_ID_PLACEHOLDER} \\`,
              "  --location global \\",
              '  --display-name "Infisical"'
            ].join("\n")}
          />
          {issuerUrl && (
            <CodeBlock
              label="Create the provider"
              language="shell"
              wrap
              code={[
                `gcloud iam workload-identity-pools providers create-oidc ${provider.providerId} \\`,
                `  --project ${PROJECT_ID_PLACEHOLDER} \\`,
                "  --location global \\",
                `  --workload-identity-pool ${provider.poolId} \\`,
                `  --issuer-uri "${issuerUrl}" \\`,
                '  --attribute-mapping "google.subject=assertion.sub,attribute.project_id=assertion.project_id"'
              ].join("\n")}
            />
          )}
          {projectId && (
            <Field
              label="Grant access to"
              description={
                scope === BindingScope.Project
                  ? "Matches the project_id claim, so every GCP connection in this project can use the grant."
                  : "Matches this connection's subject, so no other connection can use the grant."
              }
            >
              <Select
                label="Grant access to"
                options={BINDING_SCOPE_OPTIONS}
                value={bindingScope}
                onValueChange={(next) => setBindingScope(next as BindingScope)}
              />
            </Field>
          )}
          <Field label={scope === BindingScope.Project ? "Principal set" : "Principal"}>
            <Snippet
              label={scope === BindingScope.Project ? "Principal set" : "Principal"}
              copyLabel="Copy principal"
              value={member}
            />
          </Field>
          {!serviceAccountEmail && (
            <FieldDescription>
              Infisical uses the federated token directly, without a service account. Grant the
              roles this connection needs, such as Secret Manager roles, to the principal above.
              Replace &lt;ROLE&gt; with each role.
            </FieldDescription>
          )}
          <CodeBlock
            label={
              serviceAccountEmail
                ? "Let the principal impersonate the service account"
                : "Grant a role to the principal"
            }
            language="shell"
            wrap
            code={(serviceAccountEmail
              ? [
                  `gcloud iam service-accounts add-iam-policy-binding "${serviceAccountEmail}" \\`,
                  "  --role roles/iam.workloadIdentityUser \\",
                  `  --member "${member}"`
                ]
              : [
                  `gcloud projects add-iam-policy-binding ${PROJECT_ID_PLACEHOLDER} \\`,
                  "  --role <ROLE> \\",
                  `  --member "${member}"`
                ]
            ).join("\n")}
          />
          <Alert tone="warn">
            Don&apos;t grant access to the whole pool (principalSet://.../*). The provider accepts
            every token this Infisical organization issues, so the binding is what limits access.
          </Alert>
        </FieldSet>
      )}
    </FieldSet>
  );
};

/** What to configure at the provider before a federated connection can be verified. */
export const FederatedSetup = ({
  connection,
  editedCredentials
}: {
  connection: TAppConnection;
  editedCredentials?: Record<string, unknown>;
}) =>
  connection.app === AppConnection.GCP ? (
    <GcpWorkloadIdentitySetup connection={connection} editedCredentials={editedCredentials} />
  ) : (
    <FederatedCredentialDetails credential={federatedCredentialOf(connection)} />
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
