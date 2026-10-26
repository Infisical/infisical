import type { Resource } from "../../secrets-model";
import { dynamicSecretFlowProviders } from "./dynamic-secret/registry";
import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "./managed-proxy-enums";
import {
  HeaderRewritingMode,
  ProxiedServiceStep,
  type TCredentialSourceForm,
  type TProxiedServiceForm
} from "./managed-proxy-schema";
import { secretsAt } from "./shared";

type ProxyCredential = NonNullable<Extract<Resource, { kind: "proxy" }>["credentials"]>[number];
type SourceOption = { value: string; label: string; meta?: string; disabled?: boolean };

export const PROXIED_SERVICE_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/agent-proxy/quickstart/credentials";

export const PROXIED_SERVICE_STEPS = [
  {
    step: ProxiedServiceStep.Details,
    name: "Details",
    shortDescription: "Name and host",
    title: "Service details",
    subtitle: "Name the service and choose which hosts it brokers.",
    rightDescription:
      "The name identifies this service within the folder. The host pattern decides which outbound requests the agent proxy applies these credentials to."
  },
  {
    step: ProxiedServiceStep.Headers,
    name: "Header rewrites",
    shortDescription: "Request headers",
    title: "Header rewrites",
    subtitle: "Set or overwrite request headers with a secret.",
    rightDescription:
      "The proxy sets these headers on every outbound request, overwriting whatever the agent sent. Use this for Bearer tokens, API-key headers, or basic auth. Skip it if the credential is carried elsewhere."
  },
  {
    step: ProxiedServiceStep.Substitution,
    name: "Substitution",
    shortDescription: "Placeholder swaps",
    title: "Secret substitution",
    subtitle: "Swap a placeholder the agent sends for the real secret.",
    rightDescription:
      "Infisical hands the agent a placeholder as an environment variable; the proxy swaps it for the real secret wherever it appears in the surfaces you pick (path, query, header, body). Ideal when the credential sits in the URL or the agent's client validates its format."
  },
  {
    step: ProxiedServiceStep.Review,
    name: "Review",
    shortDescription: "Confirm",
    title: "Review",
    subtitle: "Confirm the configuration before saving.",
    rightDescription:
      "Double-check the host pattern and each credential. You can edit any of this later from the folder view."
  }
];

const BROKERABLE_DYNAMIC_SECRETS: Record<string, { name: string; label: string }[]> = {
  kubernetes: [{ name: "TOKEN", label: "Service Account JWT" }],
  github: [{ name: "TOKEN", label: "Token" }],
  "gcp-iam": [{ name: "TOKEN", label: "Token" }],
  "ibm-api-connect": [
    { name: "CLIENT_ID", label: "Client ID" },
    { name: "CLIENT_SECRET", label: "Client Secret" }
  ],
  "elastic-search": [
    { name: "DB_USERNAME", label: "Username" },
    { name: "DB_PASSWORD", label: "Password" }
  ],
  clickhouse: [
    { name: "DB_USERNAME", label: "Database User" },
    { name: "DB_PASSWORD", label: "Database Password" }
  ],
  couchbase: [
    { name: "username", label: "Username" },
    { name: "password", label: "Password" }
  ],
  "rabbit-mq": [
    { name: "DB_USERNAME", label: "Username" },
    { name: "DB_PASSWORD", label: "Password" }
  ],
  snowflake: [
    { name: "DB_USERNAME", label: "Username" },
    { name: "DB_PASSWORD", label: "Password" }
  ],
  milvus: [
    { name: "DB_USERNAME", label: "Database User" },
    { name: "DB_PASSWORD", label: "Database Password" }
  ],
  "azure-entra-id": [
    { name: "email", label: "Email" },
    { name: "password", label: "Password" }
  ],
  totp: [{ name: "TOTP", label: "Time-based one-time password" }]
};

export const proxySources = (
  resources: readonly Resource[],
  at: { project: string; environment: string; path: string }
) => {
  const localSecrets = [
    ...new Set(
      [
        ...secretsAt(resources, at.project, at.environment, at.path),
        ...resources
          .filter(
            (resource) =>
              resource.kind === "import" &&
              !resource.revoked &&
              resource.project === at.project &&
              resource.environment === at.environment &&
              resource.path === at.path
          )
          .flatMap((entry) =>
            entry.kind === "import"
              ? secretsAt(
                  resources,
                  entry.source.project,
                  entry.source.environment,
                  entry.source.path
                )
              : []
          )
      ].map((secret) => secret.name)
    )
  ];
  const sourceOptions: SourceOption[] = [
    ...localSecrets.map((name) => ({ value: `secret:${name}`, label: name, meta: "Secret" })),
    ...resources
      .filter(
        (resource) =>
          resource.kind === "dynamic" &&
          resource.project === at.project &&
          resource.environment === at.environment &&
          resource.path === at.path
      )
      .flatMap((resource): SourceOption[] => {
        const label = resource.kind === "dynamic" ? resource.provider : "";
        const provider = dynamicSecretFlowProviders.find(
          (entry) => entry.label === label
        )?.provider;
        const fields = provider ? BROKERABLE_DYNAMIC_SECRETS[provider] : undefined;
        if (!fields)
          return [
            {
              value: `dynamic:${resource.name}:`,
              label: resource.name,
              meta: "This dynamic secret type can't be brokered over HTTP.",
              disabled: true
            }
          ];
        return fields.map((field) => ({
          value: `dynamic:${resource.name}:${field.name}`,
          label: `${resource.name} → ${field.label}`,
          meta: "Dynamic secret"
        }));
      })
  ];
  return { localSecrets, sourceOptions };
};

const emptySource = (): TCredentialSourceForm => ({
  secretKey: "",
  dynamicSecretName: "",
  dynamicSecretField: ""
});

const genPlaceholder = () =>
  `placeholder_${Array.from(
    { length: 12 },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("")}`;

const toSource = (credential: ProxyCredential): TCredentialSourceForm =>
  credential.dynamicSecretName
    ? {
        secretKey: "",
        dynamicSecretName: credential.dynamicSecretName,
        dynamicSecretField: credential.dynamicSecretField ?? ""
      }
    : { ...emptySource(), secretKey: credential.secretKey ?? "" };

const hasSource = (source: TCredentialSourceForm) =>
  Boolean(source.secretKey || source.dynamicSecretName);

const sourceToCredential = (source: TCredentialSourceForm) =>
  source.dynamicSecretName
    ? {
        dynamicSecretName: source.dynamicSecretName,
        dynamicSecretField: source.dynamicSecretField
      }
    : { secretKey: source.secretKey };

export const toDefaultValues = (
  service: Extract<Resource, { kind: "proxy" }>
): TProxiedServiceForm => {
  const credentials = service.credentials ?? [];
  const headerCredentials = credentials.filter(
    (credential) => credential.role === ProxiedServiceCredentialRole.HeaderRewrite
  );
  const isBasicAuth = headerCredentials.some((credential) => credential.headerPurpose);
  const username = headerCredentials.find(
    (credential) => credential.headerPurpose === ProxiedServiceHeaderPurpose.Username
  );
  const password = headerCredentials.find(
    (credential) => credential.headerPurpose === ProxiedServiceHeaderPurpose.Password
  );
  return {
    name: service.name,
    hostPattern: service.host,
    isEnabled: service.enabled,
    headerMode: isBasicAuth ? HeaderRewritingMode.BasicAuth : HeaderRewritingMode.Headers,
    headers: isBasicAuth
      ? []
      : headerCredentials.map((credential) => ({
          ...toSource(credential),
          headerName: credential.headerName ?? "",
          headerPrefix: credential.headerPrefix ?? ""
        })),
    basicAuth: {
      username: username ? toSource(username) : emptySource(),
      password: password ? toSource(password) : emptySource()
    },
    substitutions: credentials
      .filter(
        (credential) => credential.role === ProxiedServiceCredentialRole.CredentialSubstitution
      )
      .map((credential) => ({
        ...toSource(credential),
        placeholderKey: credential.placeholderKey ?? "",
        placeholderValue: credential.placeholderValue ?? genPlaceholder(),
        surfaces: (credential.substitutionSurfaces ?? []) as ProxiedServiceSubstitutionSurface[]
      }))
  };
};

export const toCredentials = (form: TProxiedServiceForm): ProxyCredential[] => {
  const credentials: ProxyCredential[] = [];
  if (form.headerMode === HeaderRewritingMode.BasicAuth) {
    (["username", "password"] as const).forEach((purpose) => {
      const source = form.basicAuth?.[purpose];
      if (!source || !hasSource(source)) return;
      credentials.push({
        ...sourceToCredential(source),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose:
          purpose === "username"
            ? ProxiedServiceHeaderPurpose.Username
            : ProxiedServiceHeaderPurpose.Password
      });
    });
  } else {
    form.headers.forEach((header) =>
      credentials.push({
        ...sourceToCredential(header),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerName: header.headerName,
        headerPrefix: header.headerPrefix || undefined
      })
    );
  }
  form.substitutions.forEach((substitution) =>
    credentials.push({
      ...sourceToCredential(substitution),
      role: ProxiedServiceCredentialRole.CredentialSubstitution,
      placeholderKey: substitution.placeholderKey,
      placeholderValue: substitution.placeholderValue,
      substitutionSurfaces: substitution.surfaces
    })
  );
  return credentials;
};
