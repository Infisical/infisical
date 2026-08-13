import { ProxiedServiceTemplate } from "@app/helpers/proxiedServiceTemplates";
import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/hooks/api/proxiedServices/enums";
import {
  TProxiedService,
  TProxiedServiceCredentialInput
} from "@app/hooks/api/proxiedServices/types";

import { HeaderRewritingMode, TCredentialSourceForm, TProxiedServiceForm } from "./schema";

export const genPlaceholder = () =>
  `placeholder_${Array.from(
    { length: 12 },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("")}`;

const emptySource = (): TCredentialSourceForm => ({
  environment: "",
  secretPath: "",
  secretKey: "",
  dynamicSecretName: "",
  dynamicSecretField: ""
});

// Round-trips the credential's own location so an edit does not silently relocate a secret to the
// service's default.
const toSource = (c: TProxiedService["credentials"][number]): TCredentialSourceForm => {
  const location = { environment: c.environment, secretPath: c.secretPath };
  return c.dynamicSecretName
    ? {
        ...location,
        secretKey: "",
        dynamicSecretName: c.dynamicSecretName,
        dynamicSecretField: c.dynamicSecretField ?? ""
      }
    : { ...location, secretKey: c.secretKey ?? "", dynamicSecretName: "", dynamicSecretField: "" };
};

const hasSource = (src: TCredentialSourceForm) => Boolean(src.secretKey || src.dynamicSecretName);

// Emits the source half of a credential input: either a static secretKey or a dynamic
// secret + output field. (Lease config, e.g. k8s namespace, is intentionally not collected.)
const sourceToInput = (
  src: TCredentialSourceForm,
  fallback: { environment: string; secretPath: string }
): Pick<
  TProxiedServiceCredentialInput,
  "environment" | "secretPath" | "secretKey" | "dynamicSecretName" | "dynamicSecretField"
> => {
  const location = {
    environment: src.environment || fallback.environment,
    secretPath: src.secretPath || fallback.secretPath
  };
  return src.dynamicSecretName
    ? {
        ...location,
        dynamicSecretName: src.dynamicSecretName,
        dynamicSecretField: src.dynamicSecretField
      }
    : { ...location, secretKey: src.secretKey };
};

// The legacy blank-slate defaults, used for "Custom" and as the base for new services.
export const emptyFormValues = (defaultEnvironment = ""): TProxiedServiceForm => ({
  name: "",
  hostPattern: "",
  isEnabled: true,
  defaultEnvironment,
  headerMode: HeaderRewritingMode.Headers,
  headers: [{ ...emptySource(), headerName: "Authorization", headerPrefix: "Bearer" }],
  basicAuth: { username: emptySource(), password: emptySource() },
  substitutions: []
});

export const toDefaultValues = (
  svc?: TProxiedService,
  defaultEnvironment = ""
): TProxiedServiceForm => {
  if (!svc) return emptyFormValues(defaultEnvironment);

  const headerCreds = svc.credentials.filter(
    (c) => c.role === ProxiedServiceCredentialRole.HeaderRewrite
  );
  const isBasicAuth = headerCreds.some((c) => c.headerPurpose);
  const username = headerCreds.find(
    (c) => c.headerPurpose === ProxiedServiceHeaderPurpose.Username
  );
  const password = headerCreds.find(
    (c) => c.headerPurpose === ProxiedServiceHeaderPurpose.Password
  );
  const subs = svc.credentials.filter(
    (c) => c.role === ProxiedServiceCredentialRole.CredentialSubstitution
  );

  // The default is taken from the first credential so an unchanged edit round-trips to the same rows.
  const firstCredential = svc.credentials[0];

  return {
    name: svc.name,
    hostPattern: svc.hostPattern,
    isEnabled: svc.isEnabled,
    defaultEnvironment: firstCredential?.environment ?? defaultEnvironment,
    headerMode: isBasicAuth ? HeaderRewritingMode.BasicAuth : HeaderRewritingMode.Headers,
    headers: isBasicAuth
      ? []
      : headerCreds.map((c) => ({
          ...toSource(c),
          headerName: c.headerName ?? "",
          headerPrefix: c.headerPrefix ?? ""
        })),
    basicAuth: {
      username: username ? toSource(username) : emptySource(),
      password: password ? toSource(password) : emptySource()
    },
    substitutions: subs.map((c) => ({
      ...toSource(c),
      placeholderKey: c.placeholderKey ?? "",
      placeholderValue: c.placeholderValue ?? genPlaceholder(),
      surfaces: (c.substitutionSurfaces ?? []) as ProxiedServiceSubstitutionSurface[]
    }))
  };
};

export const toCredentials = (form: TProxiedServiceForm): TProxiedServiceCredentialInput[] => {
  const credentials: TProxiedServiceCredentialInput[] = [];
  // A row that has not been touched still needs a location, so the seed environment and the project root
  // stand in. Every row the author actually edited carries its own.
  const fallback = { environment: form.defaultEnvironment, secretPath: "/" };

  if (form.headerMode === HeaderRewritingMode.BasicAuth) {
    if (form.basicAuth && hasSource(form.basicAuth.username)) {
      credentials.push({
        ...sourceToInput(form.basicAuth.username, fallback),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Username
      });
    }
    if (form.basicAuth && hasSource(form.basicAuth.password)) {
      credentials.push({
        ...sourceToInput(form.basicAuth.password, fallback),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Password
      });
    }
  } else {
    form.headers.forEach((h) => {
      credentials.push({
        ...sourceToInput(h, fallback),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerName: h.headerName,
        // omit rather than send null: the API field is optional and rejects null
        headerPrefix: h.headerPrefix || undefined
      });
    });
  }

  form.substitutions.forEach((s) => {
    credentials.push({
      ...sourceToInput(s, fallback),
      role: ProxiedServiceCredentialRole.CredentialSubstitution,
      placeholderKey: s.placeholderKey,
      placeholderValue: s.placeholderValue,
      substitutionSurfaces: s.surfaces
    });
  });

  return credentials;
};

// Appends a numeric suffix ("openai" -> "openai-2") until the name is unused in the folder.
export const uniqueServiceName = (base: string, existingNames: string[]) => {
  const taken = new Set(existingNames);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
};

// Seeds the form from a template. Every source is left blank — the one thing the user picks.
// Placeholders are generated once here so re-renders don't churn the value.
export const buildTemplateFormValues = (
  template: ProxiedServiceTemplate,
  existingNames: string[],
  defaultEnvironment = ""
): TProxiedServiceForm => {
  const isBasicAuth = Boolean(template.seed.basicAuth);

  return {
    name: uniqueServiceName(template.defaultName ?? template.key, existingNames),
    hostPattern: template.hostPattern,
    isEnabled: true,
    defaultEnvironment,
    headerMode: isBasicAuth ? HeaderRewritingMode.BasicAuth : HeaderRewritingMode.Headers,
    // Substitution-only templates omit `headers`, which becomes an empty list here so the
    // legacy Authorization row is dropped and the Header Rewrites step is genuinely empty.
    headers: isBasicAuth
      ? []
      : (template.seed.headers ?? []).map((h) => ({
          ...emptySource(),
          headerName: h.headerName,
          headerPrefix: h.headerPrefix ?? ""
        })),
    basicAuth: { username: emptySource(), password: emptySource() },
    substitutions: (template.seed.substitutions ?? []).map((s) => ({
      ...emptySource(),
      placeholderKey: s.placeholderKey,
      placeholderValue: s.generatePlaceholder(),
      surfaces: s.surfaces
    }))
  };
};
