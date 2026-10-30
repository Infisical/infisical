import { useWatch } from "react-hook-form";

import { Stack } from "@app/components/v4/ui/layout";
import { AWS_REGIONS } from "@app/helpers/appConnections";

import {
  notListedHint,
  PasswordRequirementsFields,
  PasswordRequirementsReview,
  ResourceComboboxField,
  ReviewSection,
  type RotationViews,
  SecretsMappingFields,
  TextField,
  useIsUpdate,
  useRotationForm
} from "../fields";
import { ROTATION_TEMPLATES } from "../model";
import {
  GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH,
  OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH,
  SecretRotation
} from "../schemas";

const DATADOG_API_KEY_NAME_MAX_LENGTH = 255;

const AUTH0_CLIENTS = [
  { id: "demo-auth0-client-checkout", name: "checkout-web (demo)" },
  { id: "demo-auth0-client-billing", name: "billing-worker (demo)" }
];
const AZURE_APPS = [
  {
    id: "00000000-demo-4000-8000-0000000000a1",
    name: "payments-api (demo)",
    appId: "demo-app-id-a1"
  },
  {
    id: "00000000-demo-4000-8000-0000000000a2",
    name: "ledger-sync (demo)",
    appId: "demo-app-id-a2"
  }
];
const AWS_IAM_USERS = ["demo-payments-deployer", "demo-ledger-reader"];
const OKTA_APPS = [
  { id: "demo0oa1checkout", label: "Checkout portal (demo)" },
  { id: "demo0oa2billing", label: "Billing console (demo)" }
];
const DATABRICKS_SERVICE_PRINCIPALS = [
  { id: "demo-sp-1001", name: "etl-runner (demo)", clientId: "demo-client-1001" },
  { id: "demo-sp-1002", name: "reporting-bot (demo)", clientId: "demo-client-1002" }
];
const SALESFORCE_APPS = [
  { identifier: "demo-0Hx001", developerName: "Payments_Integration_Demo" },
  { identifier: "demo-0Hx002", developerName: "Ledger_Export_Demo" }
];
const OPENAI_PROJECTS = [
  { id: "proj_demo_payments", name: "payments (demo)" },
  { id: "proj_demo_support", name: "support-assistant (demo)" }
];
const DATADOG_SERVICE_ACCOUNTS = [
  { id: "demo-sa-7f1c", name: "ci-monitoring (demo)" },
  { id: "demo-sa-9b2e", name: "payments-dashboards (demo)" }
];
const FIREWORKS_SERVICE_ACCOUNTS = [
  { name: "accounts/demo/users/inference-bot", displayName: "Inference bot (demo)" },
  { name: "accounts/demo/users/eval-runner", displayName: "Eval runner (demo)" }
];
const getUserId = (name: string) => name.split("/").pop() ?? name;

const useValues = () => {
  const { control } = useRotationForm();
  const [parameters, secretsMapping] = useWatch({
    control,
    name: ["parameters", "secretsMapping"]
  });
  return { parameters: parameters ?? {}, secretsMapping: secretsMapping ?? {} };
};

const mappings = (type: SecretRotation, rows: [string, string][]) =>
  function Mappings() {
    const template = ROTATION_TEMPLATES[type].secretsMapping;
    return (
      <SecretsMappingFields
        items={rows.map(([name, key]) => ({ name, key, placeholder: template[key] }))}
      />
    );
  };

function MappingReview({ rows }: { rows: [string, string][] }) {
  const { secretsMapping } = useValues();
  return (
    <ReviewSection
      label="Secrets Mapping"
      items={rows.map(([label, key]) => [label, secretsMapping[key]] as const)}
    />
  );
}

const clientRows: [string, string][] = [
  ["Client ID", "clientId"],
  ["Client Secret", "clientSecret"]
];

function Auth0Parameters() {
  return (
    <ResourceComboboxField
      name="parameters.clientId"
      label="Application"
      placeholder="Select an application..."
      options={AUTH0_CLIENTS.map((client) => ({ value: client.id, label: client.name }))}
      description={notListedHint(
        "Don't see the application you're looking for?",
        "Ensure that your connection has the read_clients permission and the application exists in the connection's audience."
      )}
    />
  );
}

function Auth0Review() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection label="Parameters" items={[["Client ID", parameters.clientId]]} />
      <MappingReview rows={clientRows} />
    </>
  );
}

function AzureParameters() {
  const { setValue } = useRotationForm();
  return (
    <ResourceComboboxField
      name="parameters.objectId"
      label="Application"
      placeholder="Select an application..."
      options={AZURE_APPS.map((app) => ({ value: app.id, label: app.name }))}
      onSelect={(id) => {
        const app = AZURE_APPS.find((entry) => entry.id === id);
        setValue("parameters.appName", app?.name);
        setValue("parameters.clientId", app?.appId);
      }}
      description={notListedHint(
        "Don't see the application you're looking for?",
        "Ensure that your connection has the Application.ReadWrite.All, Directory.ReadWrite.All, Application.ReadWrite.OwnedBy, user_impersonation and User.Read permissions and the application exists in Azure."
      )}
    />
  );
}

function AzureReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["App Name", parameters.appName],
          ["App ID", parameters.objectId]
        ]}
      />
      <MappingReview rows={clientRows} />
    </>
  );
}

function AwsParameters() {
  return (
    <>
      <ResourceComboboxField
        name="parameters.userName"
        label="IAM User"
        placeholder="Select an IAM user..."
        options={AWS_IAM_USERS.map((user) => ({ value: user, label: user }))}
        description={notListedHint(
          "Don't see the IAM user you're looking for?",
          "Ensure that your connection has the correct permissions."
        )}
      />
      <ResourceComboboxField
        name="parameters.region"
        label="Region (optional)"
        tooltip="Required only if no global scope is set."
        placeholder="Select region..."
        requiresConnection={false}
        options={AWS_REGIONS.map((region) => ({
          value: region.slug,
          label: region.name,
          meta: region.slug
        }))}
      />
    </>
  );
}

function AwsReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Region", parameters.region],
          ["User Name", parameters.userName]
        ]}
      />
      <MappingReview
        rows={[
          ["Secret Access Key ID", "accessKeyId"],
          ["Secret Access Key", "secretAccessKey"]
        ]}
      />
    </>
  );
}

function OktaParameters() {
  return (
    <ResourceComboboxField
      name="parameters.clientId"
      label="OpenID Connect Application"
      placeholder="Select an application..."
      options={OKTA_APPS.map((app) => ({ value: app.id, label: app.label }))}
    />
  );
}

function OktaReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection label="Parameters" items={[["App ID", parameters.clientId]]} />
      <MappingReview rows={clientRows} />
    </>
  );
}

function DatabricksParameters() {
  const { setValue } = useRotationForm();
  return (
    <ResourceComboboxField
      name="parameters.servicePrincipalId"
      label="Service Principal"
      placeholder="Select a service principal..."
      options={DATABRICKS_SERVICE_PRINCIPALS.map((sp) => ({ value: sp.id, label: sp.name }))}
      onSelect={(id) => {
        const sp = DATABRICKS_SERVICE_PRINCIPALS.find((entry) => entry.id === id);
        setValue("parameters.servicePrincipalName", sp?.name);
        setValue("parameters.clientId", sp?.clientId);
      }}
      description={notListedHint(
        "Don't see the service principal you're looking for?",
        "Ensure that your connection has the necessary permissions to list and manage service principals in your Databricks workspace."
      )}
    />
  );
}

function DatabricksReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Service Principal", parameters.servicePrincipalName || parameters.servicePrincipalId],
          ...(parameters.clientId ? [["Client ID", parameters.clientId] as const] : [])
        ]}
      />
      <MappingReview rows={clientRows} />
    </>
  );
}

function SalesforceParameters() {
  const { setValue } = useRotationForm();
  return (
    <ResourceComboboxField
      name="parameters.appId"
      label="External Client App"
      placeholder="Select an external client app..."
      options={SALESFORCE_APPS.map((app) => ({ value: app.identifier, label: app.developerName }))}
      onSelect={(identifier) =>
        setValue(
          "parameters.appName",
          SALESFORCE_APPS.find((app) => app.identifier === identifier)?.developerName,
          { shouldDirty: true, shouldValidate: true }
        )
      }
      description={notListedHint(
        "Don't see the app you're looking for?",
        "Ensure that your Salesforce External Client App has OAuth client credentials enabled and is reachable by the connection."
      )}
    />
  );
}

function SalesforceReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection label="Parameters" items={[["External Client App", parameters.appName]]} />
      <MappingReview
        rows={[
          ["Consumer Key", "consumerKey"],
          ["Consumer Secret", "consumerSecret"]
        ]}
      />
    </>
  );
}

function GcpParameters() {
  const isUpdate = useIsUpdate();
  return (
    <TextField
      name="parameters.serviceAccountEmail"
      label="Service Account Email"
      tooltip="The service account whose keys will be rotated. The connection's service account needs the Service Account Key Admin role (roles/iam.serviceAccountKeyAdmin) on it."
      placeholder="my-app@my-project.iam.gserviceaccount.com"
      maxLength={GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH}
      disabled={isUpdate}
      description={isUpdate ? "Cannot be updated." : undefined}
    />
  );
}

function GcpReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[["Service Account Email", parameters.serviceAccountEmail]]}
      />
      <MappingReview rows={[["Service Account Key", "serviceAccountKey"]]} />
    </>
  );
}

function OpenAIParameters() {
  return (
    <>
      <ResourceComboboxField
        name="parameters.projectId"
        label="Project"
        tooltip="The OpenAI project to create service accounts in. This cannot be changed after the rotation is created."
        placeholder="Select a project..."
        options={OPENAI_PROJECTS.map((project) => ({ value: project.id, label: project.name }))}
      />
      <TextField
        name="parameters.name"
        label="Service Account Name"
        tooltip="A descriptive name for the generated service account. This will be saved in the OpenAI dashboard for reference with a suffix of the timestamp of the service account creation."
        placeholder="OpenAI Service Account Name"
        maxLength={OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH}
      />
    </>
  );
}

function OpenAIReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[
          ["Project ID", parameters.projectId],
          ["Service Account Name", parameters.name]
        ]}
      />
      <MappingReview rows={[["API Key", "apiKey"]]} />
    </>
  );
}

function DatadogApiParameters() {
  return (
    <TextField
      name="parameters.name"
      label="Key Name"
      tooltip="The name for the generated Datadog API key"
      placeholder="Infisical Rotated API Key"
      maxLength={DATADOG_API_KEY_NAME_MAX_LENGTH}
    />
  );
}

function DatadogApiReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection label="Parameters" items={[["Key Name", parameters.name]]} />
      <MappingReview
        rows={[
          ["API Key ID", "apiKeyId"],
          ["API Key", "apiKey"]
        ]}
      />
    </>
  );
}

function DatadogApplicationParameters() {
  return (
    <ResourceComboboxField
      name="parameters.serviceAccountId"
      label="Service Account"
      placeholder="Select a service account..."
      options={DATADOG_SERVICE_ACCOUNTS.map((account) => ({
        value: account.id,
        label: account.name
      }))}
    />
  );
}

function DatadogApplicationReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[["Service Account ID", parameters.serviceAccountId]]}
      />
      <MappingReview
        rows={[
          ["Application Key ID", "applicationKeyId"],
          ["Application Key", "applicationKey"]
        ]}
      />
    </>
  );
}

function ConvexParameters() {
  return (
    <TextField
      name="parameters.namePrefix"
      label="Name Prefix"
      placeholder="e.g. infisical-rotation"
    />
  );
}

function ConvexReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection label="Parameters" items={[["Name Prefix", parameters.namePrefix]]} />
      <MappingReview rows={[["Access Key", "accessKey"]]} />
    </>
  );
}

function FireworksParameters() {
  return (
    <ResourceComboboxField
      name="parameters.serviceAccountUserId"
      label="Service Account"
      tooltip="The Fireworks service account to create the API key for"
      placeholder="Select a service account..."
      options={FIREWORKS_SERVICE_ACCOUNTS.map((account) => ({
        value: getUserId(account.name),
        label: `${account.displayName} (${getUserId(account.name)})`
      }))}
    />
  );
}

function FireworksReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[["Service Account", parameters.serviceAccountUserId]]}
      />
      <MappingReview rows={[["API Key", "apiKey"]]} />
    </>
  );
}

function RedisParameters() {
  return (
    <>
      <TextField
        name="parameters.permissionScope"
        label="Permission Scope"
        defaultValue=""
        placeholder="~* +@read @write"
        tooltip={
          <Stack gap={8}>
            <p>
              This is the access control permissions that will be set for the issued Redis users.
              The format must be a valid Redis ACL pattern.
            </p>
            <p>
              The default value is <code>~* +@all</code>. You can modify it to suit your needs.
            </p>
            <p>
              For more information, please refer to the{" "}
              <a
                href="https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Redis ACL documentation
              </a>
              .
            </p>
          </Stack>
        }
      />
      <PasswordRequirementsFields />
    </>
  );
}

function RedisReview() {
  const { parameters } = useValues();
  return (
    <>
      <ReviewSection
        label="Parameters"
        items={[["Permission Scope", parameters.permissionScope]]}
      />
      <PasswordRequirementsReview requirements={parameters.passwordRequirements} />
      <MappingReview
        rows={[
          ["Username", "username"],
          ["Password", "password"]
        ]}
      />
    </>
  );
}

export const providerRotationViews = {
  [SecretRotation.Auth0ClientSecret]: {
    Parameters: Auth0Parameters,
    Mappings: mappings(SecretRotation.Auth0ClientSecret, clientRows),
    Review: Auth0Review
  },
  [SecretRotation.AzureClientSecret]: {
    Parameters: AzureParameters,
    Mappings: mappings(SecretRotation.AzureClientSecret, clientRows),
    Review: AzureReview
  },
  [SecretRotation.AwsIamUserSecret]: {
    Parameters: AwsParameters,
    Mappings: mappings(SecretRotation.AwsIamUserSecret, [
      ["Access Key ID", "accessKeyId"],
      ["Secret Access Key", "secretAccessKey"]
    ]),
    Review: AwsReview
  },
  [SecretRotation.OktaClientSecret]: {
    Parameters: OktaParameters,
    Mappings: mappings(SecretRotation.OktaClientSecret, clientRows),
    Review: OktaReview
  },
  [SecretRotation.DatabricksServicePrincipalSecret]: {
    Parameters: DatabricksParameters,
    Mappings: mappings(SecretRotation.DatabricksServicePrincipalSecret, clientRows),
    Review: DatabricksReview
  },
  [SecretRotation.SalesforceOauthCredentials]: {
    Parameters: SalesforceParameters,
    Mappings: mappings(SecretRotation.SalesforceOauthCredentials, [
      ["Consumer Key", "consumerKey"],
      ["Consumer Secret", "consumerSecret"]
    ]),
    Review: SalesforceReview
  },
  [SecretRotation.GcpServiceAccountKey]: {
    Parameters: GcpParameters,
    Mappings: mappings(SecretRotation.GcpServiceAccountKey, [
      ["Service Account Key", "serviceAccountKey"]
    ]),
    Review: GcpReview
  },
  [SecretRotation.OpenAIServiceAccount]: {
    Parameters: OpenAIParameters,
    Mappings: mappings(SecretRotation.OpenAIServiceAccount, [["API Key", "apiKey"]]),
    Review: OpenAIReview
  },
  [SecretRotation.DatadogApiKey]: {
    Parameters: DatadogApiParameters,
    Mappings: mappings(SecretRotation.DatadogApiKey, [
      ["API Key ID", "apiKeyId"],
      ["API Key", "apiKey"]
    ]),
    Review: DatadogApiReview
  },
  [SecretRotation.DatadogApplicationKeySecret]: {
    Parameters: DatadogApplicationParameters,
    Mappings: mappings(SecretRotation.DatadogApplicationKeySecret, [
      ["Application Key ID", "applicationKeyId"],
      ["Application Key", "applicationKey"]
    ]),
    Review: DatadogApplicationReview
  },
  [SecretRotation.ConvexAccessKey]: {
    Parameters: ConvexParameters,
    Mappings: mappings(SecretRotation.ConvexAccessKey, [["Access Key", "accessKey"]]),
    Review: ConvexReview
  },
  [SecretRotation.FireworksApiKey]: {
    Parameters: FireworksParameters,
    Mappings: mappings(SecretRotation.FireworksApiKey, [["API Key", "apiKey"]]),
    Review: FireworksReview
  },
  [SecretRotation.RedisCredentials]: {
    Parameters: RedisParameters,
    Mappings: mappings(SecretRotation.RedisCredentials, [
      ["Username", "username"],
      ["Password", "password"]
    ]),
    Review: RedisReview
  }
} satisfies Partial<Record<SecretRotation, RotationViews>>;
