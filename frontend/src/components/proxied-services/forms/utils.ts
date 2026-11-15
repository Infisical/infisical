import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/hooks/api/proxiedServices/enums";
import {
  TDashboardProxiedService,
  TProxiedServiceCredentialInput
} from "@app/hooks/api/proxiedServices/types";

import { HeaderRewritingMode, TCredentialSourceForm, TProxiedServiceForm } from "./schema";

export const genPlaceholder = () =>
  `placeholder_${Array.from(
    { length: 12 },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("")}`;

const emptySource = (): TCredentialSourceForm => ({
  secretKey: "",
  dynamicSecretName: "",
  dynamicSecretField: ""
});

const toSource = (c: TDashboardProxiedService["credentials"][number]): TCredentialSourceForm =>
  c.dynamicSecretName
    ? {
        secretKey: "",
        dynamicSecretName: c.dynamicSecretName,
        dynamicSecretField: c.dynamicSecretField ?? ""
      }
    : { secretKey: c.secretKey ?? "", dynamicSecretName: "", dynamicSecretField: "" };

const hasSource = (src: TCredentialSourceForm) => Boolean(src.secretKey || src.dynamicSecretName);

// Emits the source half of a credential input: either a static secretKey or a dynamic
// secret + output field. (Lease config, e.g. k8s namespace, is intentionally not collected.)
const sourceToInput = (
  src: TCredentialSourceForm
): Pick<
  TProxiedServiceCredentialInput,
  "secretKey" | "dynamicSecretName" | "dynamicSecretField"
> =>
  src.dynamicSecretName
    ? { dynamicSecretName: src.dynamicSecretName, dynamicSecretField: src.dynamicSecretField }
    : { secretKey: src.secretKey };

// The legacy blank-slate defaults, used for "Custom" and as the base for new services.
export const emptyFormValues = (): TProxiedServiceForm => ({
  name: "",
  hostPattern: "",
  isEnabled: true,
  headerMode: HeaderRewritingMode.Headers,
  headers: [{ ...emptySource(), headerName: "Authorization", headerPrefix: "Bearer" }],
  basicAuth: { username: emptySource(), password: emptySource() },
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

  if (form.headerMode === HeaderRewritingMode.BasicAuth) {
    if (form.basicAuth && hasSource(form.basicAuth.username)) {
      credentials.push({
        ...sourceToInput(form.basicAuth.username),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Username
      });
    }
    if (form.basicAuth && hasSource(form.basicAuth.password)) {
      credentials.push({
        ...sourceToInput(form.basicAuth.password),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Password
      });
    }
  } else {
    form.headers.forEach((h) => {
      credentials.push({
        ...sourceToInput(h),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerName: h.headerName,
        // omit rather than send null: the API field is optional and rejects null
        headerPrefix: h.headerPrefix || undefined
      });
    });
  }

  form.substitutions.forEach((s) => {
    credentials.push({
      ...sourceToInput(s),
      role: ProxiedServiceCredentialRole.CredentialSubstitution,
      placeholderKey: s.placeholderKey,
      placeholderValue: s.placeholderValue,
      substitutionSurfaces: s.surfaces
    });
  });

  return credentials;
};
