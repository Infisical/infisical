import { ProxiedServiceTemplate } from "@app/helpers/proxiedServiceTemplates";
import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/hooks/api/proxiedServices/enums";
import {
  TDashboardProxiedService,
  TProxiedServiceCredentialInput
} from "@app/hooks/api/proxiedServices/types";

import { HeaderRewritingMode, TProxiedServiceForm } from "./schema";

export const genPlaceholder = () =>
  `placeholder_${Array.from(
    { length: 12 },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("")}`;

// The legacy blank-slate defaults, used for "Custom" and as the base for new services.
export const emptyFormValues = (): TProxiedServiceForm => ({
  name: "",
  hostPattern: "",
  isEnabled: true,
  headerMode: HeaderRewritingMode.Headers,
  headers: [{ secretKey: "", headerName: "Authorization", headerPrefix: "Bearer" }],
  substitutions: []
});

export const toDefaultValues = (svc?: TDashboardProxiedService): TProxiedServiceForm => {
  if (!svc) return emptyFormValues();

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

  return {
    name: svc.name,
    hostPattern: svc.hostPattern,
    isEnabled: svc.isEnabled,
    headerMode: isBasicAuth ? HeaderRewritingMode.BasicAuth : HeaderRewritingMode.Headers,
    headers: isBasicAuth
      ? []
      : headerCreds.map((c) => ({
          secretKey: c.secretKey,
          headerName: c.headerName ?? "",
          headerPrefix: c.headerPrefix ?? ""
        })),
    basicAuth: isBasicAuth
      ? {
          usernameSecretKey: username?.secretKey ?? "",
          passwordSecretKey: password?.secretKey ?? ""
        }
      : undefined,
    substitutions: subs.map((c) => ({
      placeholderKey: c.placeholderKey ?? "",
      placeholderValue: c.placeholderValue ?? genPlaceholder(),
      secretKey: c.secretKey,
      surfaces: (c.substitutionSurfaces ?? []) as ProxiedServiceSubstitutionSurface[]
    }))
  };
};

export const toCredentials = (form: TProxiedServiceForm): TProxiedServiceCredentialInput[] => {
  const credentials: TProxiedServiceCredentialInput[] = [];

  if (form.headerMode === HeaderRewritingMode.BasicAuth) {
    if (form.basicAuth?.usernameSecretKey) {
      credentials.push({
        secretKey: form.basicAuth.usernameSecretKey,
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Username
      });
    }
    if (form.basicAuth?.passwordSecretKey) {
      credentials.push({
        secretKey: form.basicAuth.passwordSecretKey,
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Password
      });
    }
  } else {
    form.headers.forEach((h) => {
      credentials.push({
        secretKey: h.secretKey,
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerName: h.headerName,
        // omit rather than send null: the API field is optional and rejects null
        headerPrefix: h.headerPrefix || undefined
      });
    });
  }

  form.substitutions.forEach((s) => {
    credentials.push({
      secretKey: s.secretKey,
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

// Seeds the form from a template. Every secretKey is left blank — the one thing the user picks.
// Placeholders are generated once here so re-renders don't churn the value.
export const buildTemplateFormValues = (
  template: ProxiedServiceTemplate,
  existingNames: string[]
): TProxiedServiceForm => {
  const isBasicAuth = Boolean(template.seed.basicAuth);

  return {
    name: uniqueServiceName(template.defaultName ?? template.key, existingNames),
    hostPattern: template.hostPattern,
    isEnabled: true,
    headerMode: isBasicAuth ? HeaderRewritingMode.BasicAuth : HeaderRewritingMode.Headers,
    // Substitution-only templates omit `headers`, which becomes an empty list here so the
    // legacy Authorization row is dropped and the Header Rewrites step is genuinely empty.
    headers: isBasicAuth
      ? []
      : (template.seed.headers ?? []).map((h) => ({
          secretKey: "",
          headerName: h.headerName,
          headerPrefix: h.headerPrefix ?? ""
        })),
    basicAuth: isBasicAuth ? { usernameSecretKey: "", passwordSecretKey: "" } : undefined,
    substitutions: (template.seed.substitutions ?? []).map((s) => ({
      placeholderKey: s.placeholderKey,
      placeholderValue: s.generatePlaceholder(),
      secretKey: "",
      surfaces: s.surfaces
    }))
  };
};

// Whether a freshly-seeded template leaves the Header Rewrites step empty (so create can skip it).
export const templateSeedsNoHeaders = (template: ProxiedServiceTemplate) =>
  !template.seed.basicAuth && !(template.seed.headers && template.seed.headers.length);
