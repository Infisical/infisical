import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CopyIcon, Info, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  CodeBlock,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant, useToggle } from "@app/hooks";
import { GcpConnectionMethod, TGcpConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { useAppConnectionForm } from "./AppConnectionFormContext";
import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import {
  FederatedCredentialValue,
  GENERATED_VALUE_BORDER
} from "./shared/FederatedCredentialValue";

type Props = {
  appConnection?: TGcpConnection;
  onSubmit: (formData: SubmitData) => Promise<void>;
};

const WORKLOAD_IDENTITY_PROVIDER_PATTERN =
  /^projects\/([0-9]{1,20})\/locations\/global\/workloadIdentityPools\/([a-z0-9-]{4,32})\/providers\/([a-z0-9-]{4,32})$/;

const parseWorkloadIdentityProvider = (workloadIdentityProvider: string) => {
  const match = WORKLOAD_IDENTITY_PROVIDER_PATTERN.exec(workloadIdentityProvider);
  if (!match) return null;

  const [, projectNumber, poolId, providerId] = match;
  return { projectNumber, poolId, providerId };
};

const PROJECT_NUMBER_PATTERN = /^[0-9]{1,20}$/;
const POOL_OR_PROVIDER_ID_PATTERN = /^[a-z0-9-]{4,32}$/;
const POOL_OR_PROVIDER_ID_RULE = "Use 4 to 32 lowercase letters, digits, and hyphens";

type TWorkloadIdentityProviderParts = { projectNumber: string; poolId: string; providerId: string };

const toWorkloadIdentityProvider = ({
  projectNumber,
  poolId,
  providerId
}: TWorkloadIdentityProviderParts) =>
  `projects/${projectNumber.trim()}/locations/global/workloadIdentityPools/${poolId.trim()}/providers/${providerId.trim()}`;

// GCP keeps a deleted pool's ID reserved for 30 days, so a fixed default would collide with one deleted earlier.
// getRandomValues rather than randomUUID, which browsers only expose over HTTPS or localhost.
const randomGcpId = () =>
  `infisical-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GCP)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(GcpConnectionMethod.ServiceAccountImpersonation),
    credentials: z.object({
      serviceAccountEmail: z.string().email().trim().min(1, "Service account email required")
    })
  }),
  rootSchema.extend({
    method: z.literal(GcpConnectionMethod.WorkloadIdentityFederation),
    credentials: z.object({
      projectNumber: z
        .string()
        .trim()
        .min(1, "Project number is required")
        .regex(PROJECT_NUMBER_PATTERN, "Use the project number, which is digits only"),
      poolId: z
        .string()
        .trim()
        .min(1, "Pool ID is required")
        .regex(POOL_OR_PROVIDER_ID_PATTERN, POOL_OR_PROVIDER_ID_RULE),
      providerId: z
        .string()
        .trim()
        .min(1, "Provider ID is required")
        .regex(POOL_OR_PROVIDER_ID_PATTERN, POOL_OR_PROVIDER_ID_RULE),
      serviceAccountEmail: z
        .union([
          z.literal(""),
          z
            .string()
            .trim()
            .email("Enter a valid service account email")
            .max(254, "Service account email cannot exceed 254 characters")
        ])
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

// What the API takes: the three provider fields joined into the provider's resource name
type SubmitData =
  | Extract<FormData, { method: GcpConnectionMethod.ServiceAccountImpersonation }>
  | (Omit<
      Extract<FormData, { method: GcpConnectionMethod.WorkloadIdentityFederation }>,
      "credentials"
    > & {
      credentials: { workloadIdentityProvider: string; serviceAccountEmail?: string };
    });

type TWorkloadIdentityFederationConnection = Extract<
  TGcpConnection,
  { method: GcpConnectionMethod.WorkloadIdentityFederation }
>;

const getDefaultValues = (appConnection?: TGcpConnection) => {
  if (!appConnection) {
    return {
      app: AppConnection.GCP,
      method: GcpConnectionMethod.ServiceAccountImpersonation
    } as const;
  }

  if (appConnection.method === GcpConnectionMethod.WorkloadIdentityFederation) {
    const parts = parseWorkloadIdentityProvider(appConnection.credentials.workloadIdentityProvider);
    return {
      name: appConnection.name,
      description: appConnection.description,
      app: appConnection.app,
      method: appConnection.method,
      credentials: {
        projectNumber: parts?.projectNumber ?? "",
        poolId: parts?.poolId ?? "",
        providerId: parts?.providerId ?? "",
        serviceAccountEmail: appConnection.credentials.serviceAccountEmail ?? ""
      }
    };
  }

  return appConnection;
};

enum BindingScope {
  Connection = "connection",
  Project = "project"
}

const WorkloadIdentityFederationSetup = ({
  appConnection,
  editedProvider,
  editedServiceAccountEmail
}: {
  appConnection: TWorkloadIdentityFederationConnection;
  editedProvider?: string;
  editedServiceAccountEmail?: string;
}) => {
  const scopeVariant = useScopeVariant();
  const [bindingScope, setBindingScope] = useState(BindingScope.Connection);

  const { federatedCredential } = appConnection.credentials;
  const savedProvider = appConnection.credentials.workloadIdentityProvider;
  const savedServiceAccountEmail = appConnection.credentials.serviceAccountEmail || undefined;

  // Follows the form's unsaved edits, so GCP can be set up for a new target before verifying it
  const workloadIdentityProvider =
    editedProvider && parseWorkloadIdentityProvider(editedProvider)
      ? editedProvider
      : savedProvider;
  const serviceAccountEmail =
    editedServiceAccountEmail === undefined
      ? savedServiceAccountEmail
      : editedServiceAccountEmail.trim() || undefined;
  const provider = parseWorkloadIdentityProvider(workloadIdentityProvider);
  const isEdited =
    workloadIdentityProvider !== savedProvider || serviceAccountEmail !== savedServiceAccountEmail;

  if (!federatedCredential) return null;

  const { issuerUrl, subjectIdentifier } = federatedCredential;
  const audience =
    workloadIdentityProvider === savedProvider
      ? federatedCredential.audience
      : `https://iam.googleapis.com/${workloadIdentityProvider}`;
  const { projectId } = appConnection;
  const effectiveBindingScope = projectId ? bindingScope : BindingScope.Connection;

  const poolPath =
    provider &&
    `projects/${provider.projectNumber}/locations/global/workloadIdentityPools/${provider.poolId}`;
  const member =
    poolPath &&
    (effectiveBindingScope === BindingScope.Project
      ? `principalSet://iam.googleapis.com/${poolPath}/attribute.project_id/${projectId}`
      : `principal://iam.googleapis.com/${poolPath}/subject/${subjectIdentifier}`);

  const poolCommand =
    provider &&
    [
      `gcloud iam workload-identity-pools create ${provider.poolId} \\`,
      "  --project <GCP_PROJECT_ID> \\",
      "  --location global \\",
      '  --display-name "Infisical"'
    ].join("\n");

  const providerCommand =
    provider &&
    issuerUrl &&
    [
      `gcloud iam workload-identity-pools providers create-oidc ${provider.providerId} \\`,
      "  --project <GCP_PROJECT_ID> \\",
      "  --location global \\",
      `  --workload-identity-pool ${provider.poolId} \\`,
      `  --issuer-uri "${issuerUrl}" \\`,
      '  --attribute-mapping "google.subject=assertion.sub,attribute.project_id=assertion.project_id"'
    ].join("\n");

  const bindingCommand =
    member &&
    (serviceAccountEmail
      ? [
          `gcloud iam service-accounts add-iam-policy-binding "${serviceAccountEmail}" \\`,
          "  --role roles/iam.workloadIdentityUser \\",
          `  --member "${member}"`
        ]
      : [
          "gcloud projects add-iam-policy-binding <GCP_PROJECT_ID> \\",
          "  --role <ROLE> \\",
          `  --member "${member}"`
        ]
    ).join("\n");

  return (
    <>
      <p className="text-xs leading-normal text-accent">
        {isEdited
          ? "These values use the credentials you entered, which are saved once verification succeeds. Configure GCP with them, then verify the connection."
          : "Configure GCP with these values, then verify the connection."}
      </p>
      {issuerUrl ? (
        <FederatedCredentialValue label="Issuer" value={issuerUrl} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-accent">Issuer</span>
          <p className="text-xs leading-normal text-danger">
            The issuer is unavailable because SITE_URL is not set. Set it to this instance&apos;s
            public HTTPS URL, which GCP must be able to reach.
          </p>
        </div>
      )}
      <FederatedCredentialValue
        label="Subject Identifier"
        value={subjectIdentifier}
        className={GENERATED_VALUE_BORDER[scopeVariant]}
      />
      <FederatedCredentialValue label="Audience" value={audience} />

      {provider && poolCommand && member && bindingCommand && (
        <div className="mt-2 flex flex-col gap-3">
          <span className="text-sm font-medium">Setup Commands</span>
          <p className="text-xs leading-normal text-accent">
            Run these with the gcloud CLI. Replace{" "}
            <code className="font-mono">&lt;GCP_PROJECT_ID&gt;</code> with the ID of the project
            whose number is {provider.projectNumber}.
          </p>
          <CodeBlock label="Create the pool, if it does not exist" value={poolCommand} />
          {providerCommand && <CodeBlock label="Create the provider" value={providerCommand} />}
          {projectId && (
            <Field>
              <FieldLabel htmlFor="gcp-binding-scope">Grant Access To</FieldLabel>
              <Select
                value={bindingScope}
                onValueChange={(value) => setBindingScope(value as BindingScope)}
              >
                <SelectTrigger id="gcp-binding-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={BindingScope.Connection}>This connection only</SelectItem>
                  <SelectItem value={BindingScope.Project}>
                    Any connection in this Infisical project
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                {effectiveBindingScope === BindingScope.Project
                  ? "Matches the project_id claim, so every GCP connection in this project can use the grant."
                  : "Matches this connection's subject, so no other connection can use the grant."}
              </FieldDescription>
            </Field>
          )}
          <FederatedCredentialValue
            label={effectiveBindingScope === BindingScope.Project ? "Principal Set" : "Principal"}
            value={member}
          />
          {serviceAccountEmail ? (
            <CodeBlock
              label="Let the principal impersonate the service account"
              value={bindingCommand}
            />
          ) : (
            <>
              <p className="text-xs leading-normal text-accent">
                Infisical uses the federated token directly, without a service account. Grant the
                roles this connection needs, such as Secret Manager roles, to the principal above.
                Replace <code className="font-mono">&lt;ROLE&gt;</code> with each role.
              </p>
              <CodeBlock label="Grant a role to the principal" value={bindingCommand} />
            </>
          )}
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              Do not grant access to the whole pool (principalSet://.../*). The provider accepts
              every token this Infisical organization issues, so the binding is what limits access.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </>
  );
};

export const GcpConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { isNewConnection } = useAppConnectionForm();
  const [hasVerifyFailed, setHasVerifyFailed] = useState(false);
  // Suggested for a new connection, so the user only needs to look up the project number; the setup commands
  // create a pool and provider with these IDs
  const [suggestedIds] = useState(() => ({ poolId: randomGcpId(), providerId: randomGcpId() }));

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });
  const { currentOrg } = useOrganization();

  const [isCopied, { timedToggle: toggleIsCopied }] = useToggle(false);
  const expectedAccountIdSuffix = currentOrg.id.split("-").slice(0, 2).join("-");

  const { handleSubmit, control, watch } = form;
  // The shared hint gives way to an error under either input, as a field's own hint does
  const credentialErrors = form.formState.errors.credentials as
    | { poolId?: { message?: string }; providerId?: { message?: string } }
    | undefined;
  const hasPoolOrProviderError = Boolean(credentialErrors?.poolId || credentialErrors?.providerId);

  const selectedMethod = watch("method");
  const watchedCredentials = watch("credentials") as
    | (Partial<TWorkloadIdentityProviderParts> & { serviceAccountEmail?: string })
    | undefined;
  const watchedProvider =
    watchedCredentials?.projectNumber && watchedCredentials.poolId && watchedCredentials.providerId
      ? toWorkloadIdentityProvider({
          projectNumber: watchedCredentials.projectNumber,
          poolId: watchedCredentials.poolId,
          providerId: watchedCredentials.providerId
        })
      : undefined;
  const isWorkloadIdentityFederation =
    selectedMethod === GcpConnectionMethod.WorkloadIdentityFederation;

  const onSubmitHandler = async (formData: FormData) => {
    if (formData.method !== GcpConnectionMethod.WorkloadIdentityFederation) {
      await onSubmit(formData);
      return;
    }

    const payload: SubmitData = {
      ...formData,
      credentials: {
        workloadIdentityProvider: toWorkloadIdentityProvider(formData.credentials),
        serviceAccountEmail: formData.credentials.serviceAccountEmail || undefined
      }
    };

    if (!isUpdate) {
      await onSubmit(payload);
      return;
    }

    setHasVerifyFailed(false);
    try {
      await onSubmit(payload);
    } catch {
      // The request's error toast already explains the failure
      setHasVerifyFailed(true);
    }
  };

  let submitLabel = isUpdate ? "Update Credentials" : "Connect to GCP";
  if (isWorkloadIdentityFederation) {
    if (!isUpdate) submitLabel = "Create Connection";
    else submitLabel = hasVerifyFailed ? "Retry Verification" : "Verify Connection";
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmitHandler)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {appConnection && isWorkloadIdentityFederation && (
          <>
            <Field className="mb-4">
              <FieldLabel htmlFor="app-connection-name">Name</FieldLabel>
              <Input id="app-connection-name" value={appConnection.name} readOnly disabled />
            </Field>
            <Field className="mb-4">
              <FieldLabel htmlFor="app-connection-description">
                Description <span className="text-muted">(optional)</span>
              </FieldLabel>
              <TextArea
                id="app-connection-description"
                className="resize-none"
                rows={2}
                placeholder="Connection description..."
                value={appConnection.description ?? ""}
                readOnly
                disabled
              />
            </Field>
          </>
        )}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="method">
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.GCP].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GcpConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {isUpdate && isWorkloadIdentityFederation && (
                <FieldDescription>
                  Name and method are fixed once the connection is created.
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {selectedMethod === GcpConnectionMethod.ServiceAccountImpersonation && (
          <Controller
            name="credentials.serviceAccountEmail"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="group mb-4">
                <FieldLabel htmlFor="service-account-email">Service Account Email</FieldLabel>
                <SecretInput
                  aria-describedby={
                    error
                      ? "service-account-email-description service-account-email-error"
                      : "service-account-email-description"
                  }
                  isError={Boolean(error)}
                  id="service-account-email"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
                {!error && (
                  <FieldDescription id="service-account-email-description">
                    <span className="block">
                      {`Service account ID must be suffixed with "${expectedAccountIdSuffix}"`}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            variant="ghost-muted"
                            size="xs"
                            aria-label="copy"
                            onClick={() => {
                              if (isCopied) {
                                return;
                              }

                              navigator.clipboard.writeText(expectedAccountIdSuffix);

                              createNotification({
                                text: "Copied to clipboard",
                                type: "info"
                              });

                              toggleIsCopied(2000);
                            }}
                            className="ml-1"
                          >
                            {isCopied ? (
                              <CheckIcon className="size-4" />
                            ) : (
                              <CopyIcon className="size-4" />
                            )}
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Copy</TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="block">
                      Example:
                      <span className="ml-1">service-account-</span>
                      <span className="font-medium">{expectedAccountIdSuffix}</span>
                      <span>@my-project.iam.gserviceaccount.com</span>
                    </span>
                  </FieldDescription>
                )}
                <FieldError id="service-account-email-error" errors={[error]} />
              </Field>
            )}
          />
        )}
        {isWorkloadIdentityFederation && (
          <>
            <Controller
              name="credentials.projectNumber"
              control={control}
              shouldUnregister
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="gcp-project-number">Project Number</FieldLabel>
                  <Input
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      setHasVerifyFailed(false);
                    }}
                    id="gcp-project-number"
                    disabled={isNewConnection}
                    inputMode="numeric"
                    placeholder="123456789012"
                    isError={Boolean(error)}
                  />
                  {!error && (
                    <FieldDescription>
                      The number of the GCP project that holds the workload identity pool. Find it
                      with{" "}
                      <span className="font-mono whitespace-nowrap">
                        gcloud projects describe &lt;PROJECT_ID&gt;
                        --format=&quot;value(projectNumber)&quot;
                      </span>
                      .
                    </FieldDescription>
                  )}
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Field className="mb-4">
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  name="credentials.poolId"
                  control={control}
                  shouldUnregister
                  defaultValue={suggestedIds.poolId}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="gcp-pool-id">Pool ID</FieldLabel>
                      <Input
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          setHasVerifyFailed(false);
                        }}
                        id="gcp-pool-id"
                        disabled={isNewConnection}
                        isError={Boolean(error)}
                      />
                    </Field>
                  )}
                />
                <Controller
                  name="credentials.providerId"
                  control={control}
                  shouldUnregister
                  defaultValue={suggestedIds.providerId}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="gcp-provider-id">Provider ID</FieldLabel>
                      <Input
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          setHasVerifyFailed(false);
                        }}
                        id="gcp-provider-id"
                        disabled={isNewConnection}
                        isError={Boolean(error)}
                      />
                    </Field>
                  )}
                />
              </div>
              <FieldDescription isOpen={!hasPoolOrProviderError}>
                {isUpdate
                  ? "The workload identity pool and provider that trust this connection."
                  : "Suggested IDs for a new pool and provider, which the setup commands create after you create the connection. To use an existing pool and provider, enter their IDs instead."}
              </FieldDescription>
              <FieldError errors={[credentialErrors?.poolId, credentialErrors?.providerId]} />
            </Field>
            <Controller
              name="credentials.serviceAccountEmail"
              control={control}
              shouldUnregister
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="wif-service-account-email">
                    Service Account Email <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      field.onChange(e);
                      setHasVerifyFailed(false);
                    }}
                    id="wif-service-account-email"
                    disabled={isNewConnection}
                    placeholder="infisical@my-project.iam.gserviceaccount.com"
                    isError={Boolean(error)}
                  />
                  {!error && (
                    <FieldDescription>
                      The service account Infisical impersonates. Leave it empty to grant GCP roles
                      to the connection&apos;s principal directly.
                    </FieldDescription>
                  )}
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <span className="text-sm font-medium">Federated Credential</span>
              {appConnection?.method === GcpConnectionMethod.WorkloadIdentityFederation ? (
                <WorkloadIdentityFederationSetup
                  appConnection={appConnection}
                  editedProvider={watchedProvider}
                  editedServiceAccountEmail={watchedCredentials?.serviceAccountEmail}
                />
              ) : (
                <p className="text-xs leading-normal text-accent">
                  The subject identifier includes the connection ID, so Infisical creates the
                  connection first. Create it to get the values and gcloud commands that configure
                  GCP.
                </p>
              )}
            </div>
          </>
        )}
        <AppConnectionFormFooter
          submitLabel={submitLabel}
          allowPristineSubmit={isUpdate && isWorkloadIdentityFederation}
        />
      </form>
    </FormProvider>
  );
};
