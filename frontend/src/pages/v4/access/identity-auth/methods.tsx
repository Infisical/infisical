import type { ReactNode } from "react";
import type { DataListItem } from "@infisical/cipher/ui/list";

import {
  OrgGatewayPermissionActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getObjectFromSeconds } from "@app/helpers/datetime";
import { mapTrustedIpsFromServer } from "@app/helpers/identityAuthSchemas";
import { isValidIpOrCidr } from "@app/helpers/ip";
import { UNIVERSAL_AUTH_DEFAULTS } from "@app/hooks/api/identities/constants";
import {
  IdentityAuthMethod,
  IdentityJwtConfigurationType,
  SpiffeTrustBundleProfile
} from "@app/hooks/api/identities/enums";
import {
  type IdentityAliCloudAuth,
  type IdentityAwsAuth,
  type IdentityAzureAuth,
  type IdentityGcpAuth,
  type IdentityJwtAuth,
  type IdentityKubernetesAuth,
  IdentityKubernetesAuthTokenReviewMode,
  type IdentityLdapAuth,
  type IdentityOciAuth,
  type IdentityOidcAuth,
  type IdentitySpiffeAuth,
  type IdentityTlsCertAuth,
  type IdentityTokenAuth,
  type IdentityTrustedIp,
  type IdentityUniversalAuth
} from "@app/hooks/api/identities/types";
import { MachineIdentityAuthMethod } from "@app/hooks/api/identityAuthTemplates/types";

import { useV4Adapter } from "../../data/adapters";
import type { V4QueryResult } from "../../data/contract";
import { useOrgPermission } from "../permissions";
import {
  Group,
  ListField,
  type Pair,
  PairsField,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
  TextListField,
  TrustedIpsField
} from "./fields";
import { ipTagError, splitList } from "./lists";

import css from "./identity-auth.module.css";

export type FieldErrors = Record<string, string>;
export type MethodContext<C> = { isUpdate: boolean; config?: C; maxTtl: number };
type FieldsProps<D, C> = {
  draft: D;
  set: (patch: Partial<D>) => void;
  ctx: MethodContext<C>;
};

export type MethodSpec<C, D> = {
  useConfig(identityId: string, enabled: boolean): V4QueryResult<C>;
  draft(config?: C): D;
  validate(draft: D, ctx: MethodContext<C>): FieldErrors;
  payload(draft: D, ctx: MethodContext<C>): Record<string, unknown>;
  fields(props: FieldsProps<D, C>): ReactNode;
  details(config: C): DataListItem[];
  certificates?(config: C): Certificate[];
};

const ttlDays = (maxTtl: number) => Math.floor(maxTtl / 86_400);
const DEFAULT_TTL = "2592000";
const DEFAULT_IPS = UNIVERSAL_AUTH_DEFAULTS.accessTokenTrustedIps.map((entry) => entry.ipAddress);
const CERT_PLACEHOLDER = "-----BEGIN CERTIFICATE----- ...";
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };
const WHOLE = /^\d+$/;

const ipStrings = (list: IdentityTrustedIp[]) =>
  mapTrustedIpsFromServer(list).map((entry) => entry.ipAddress);
const joinList = (values: string[]) => values.join(", ");
const isUrl = (value: string) => {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
};

type TokenConfig = {
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
  accessTokenPeriod?: number;
};

type TokenDraft = {
  accessTokenTTL: string;
  accessTokenMaxTTL: string;
  accessTokenNumUsesLimit: string;
  accessTokenTrustedIps: string[];
};

const tokenDraft = (config?: TokenConfig): TokenDraft =>
  config
    ? {
        accessTokenTTL: String(config.accessTokenTTL),
        accessTokenMaxTTL: String(config.accessTokenMaxTTL),
        accessTokenNumUsesLimit: config.accessTokenNumUsesLimit
          ? String(config.accessTokenNumUsesLimit)
          : "",
        accessTokenTrustedIps: ipStrings(config.accessTokenTrustedIps)
      }
    : {
        accessTokenTTL: DEFAULT_TTL,
        accessTokenMaxTTL: DEFAULT_TTL,
        accessTokenNumUsesLimit: "",
        accessTokenTrustedIps: DEFAULT_IPS
      };

const tokenPayload = (draft: TokenDraft) => ({
  accessTokenTTL: Number(draft.accessTokenTTL),
  accessTokenMaxTTL: Number(draft.accessTokenMaxTTL),
  accessTokenNumUsesLimit: Number(draft.accessTokenNumUsesLimit || 0),
  accessTokenTrustedIps: draft.accessTokenTrustedIps.map((ipAddress) => ({ ipAddress }))
});

const ipErrors = (values: string[]) => {
  if (!values.length) return "Add at least one IP address or CIDR block";
  return values.some((value) => !isValidIpOrCidr(value))
    ? "Enter a valid IPv4, IPv6, or CIDR block"
    : undefined;
};

const tokenErrors = (draft: TokenDraft, maxTtl: number, skipTtl = false): FieldErrors => {
  const errors: FieldErrors = {};
  if (!skipTtl) {
    (
      [
        ["accessTokenTTL", "Access token TTL"],
        ["accessTokenMaxTTL", "Access token max TTL"]
      ] as const
    ).forEach(([key, label]) => {
      if (!WHOLE.test(draft[key])) errors[key] = "Enter a whole number";
      else if (Number(draft[key]) > maxTtl)
        errors[key] = `${label} cannot exceed ${ttlDays(maxTtl)} days`;
    });
    const draftMaxTtl = Number(draft.accessTokenMaxTTL);
    if (!errors.accessTokenTTL && !errors.accessTokenMaxTTL && draftMaxTtl > 0)
      if (Number(draft.accessTokenTTL) > draftMaxTtl)
        errors.accessTokenTTL = "Access token TTL cannot be greater than access token max TTL";
  }
  if (draft.accessTokenNumUsesLimit && !WHOLE.test(draft.accessTokenNumUsesLimit))
    errors.accessTokenNumUsesLimit = "Enter a whole number";
  const ips = ipErrors(draft.accessTokenTrustedIps);
  if (ips) errors.accessTokenTrustedIps = ips;
  return errors;
};

const TokenFields = <D extends TokenDraft>({
  draft,
  set,
  maxTtl,
  hideTtl,
  extraTokenFields,
  extraIps
}: {
  draft: D;
  set: (patch: Partial<D>) => void;
  maxTtl: number;
  hideTtl?: boolean;
  extraTokenFields?: ReactNode;
  extraIps?: ReactNode;
}) => (
  <>
    <Group legend="Access tokens">
      {!hideTtl && (
        <div className={css.split}>
          <TextField
            name="accessTokenTTL"
            label="Access token TTL (seconds)"
            type="number"
            placeholder={DEFAULT_TTL}
            description={`Max: ${ttlDays(maxTtl)} days`}
            value={draft.accessTokenTTL}
            onChange={(accessTokenTTL) => set({ accessTokenTTL } as Partial<D>)}
          />
          <TextField
            name="accessTokenMaxTTL"
            label="Access token max TTL (seconds)"
            type="number"
            placeholder={DEFAULT_TTL}
            description={`Max: ${ttlDays(maxTtl)} days`}
            value={draft.accessTokenMaxTTL}
            onChange={(accessTokenMaxTTL) => set({ accessTokenMaxTTL } as Partial<D>)}
          />
        </div>
      )}
      <TextField
        name="accessTokenNumUsesLimit"
        label="Access token max number of uses"
        type="number"
        optional
        placeholder="Unlimited uses"
        value={draft.accessTokenNumUsesLimit}
        onChange={(accessTokenNumUsesLimit) => set({ accessTokenNumUsesLimit } as Partial<D>)}
      />
      {extraTokenFields}
    </Group>
    <Group legend="Trusted IPs">
      {extraIps}
      <TrustedIpsField
        name="accessTokenTrustedIps"
        label="Access token trusted IPs"
        placeholder="0.0.0.0/0"
        validate={ipTagError}
        values={draft.accessTokenTrustedIps}
        onChange={(accessTokenTrustedIps) => set({ accessTokenTrustedIps } as Partial<D>)}
      />
    </Group>
  </>
);

type LockoutConfig = {
  lockoutEnabled: boolean;
  lockoutThreshold: number;
  lockoutDurationSeconds: number;
  lockoutCounterResetSeconds: number;
};

type LockoutDraft = {
  lockoutEnabled: boolean;
  lockoutThreshold: string;
  lockoutDurationValue: string;
  lockoutDurationUnit: string;
  lockoutCounterResetValue: string;
  lockoutCounterResetUnit: string;
};

const lockoutDraft = (config?: LockoutConfig): LockoutDraft => {
  const source = config ?? UNIVERSAL_AUTH_DEFAULTS;
  const duration = getObjectFromSeconds(source.lockoutDurationSeconds, ["s", "m", "h", "d"]);
  const reset = getObjectFromSeconds(source.lockoutCounterResetSeconds, ["s", "m", "h"]);
  return {
    lockoutEnabled: source.lockoutEnabled,
    lockoutThreshold: String(source.lockoutThreshold),
    lockoutDurationValue: String(duration.value),
    lockoutDurationUnit: duration.unit,
    lockoutCounterResetValue: String(reset.value),
    lockoutCounterResetUnit: reset.unit
  };
};

const lockoutSeconds = (value: string, unit: string) => Number(value) * UNIT_SECONDS[unit];

const lockoutPayload = (draft: LockoutDraft) => ({
  lockoutEnabled: draft.lockoutEnabled,
  lockoutThreshold: Number(draft.lockoutThreshold),
  lockoutDurationSeconds: lockoutSeconds(draft.lockoutDurationValue, draft.lockoutDurationUnit),
  lockoutCounterResetSeconds: lockoutSeconds(
    draft.lockoutCounterResetValue,
    draft.lockoutCounterResetUnit
  )
});

const lockoutErrors = (draft: LockoutDraft): FieldErrors => {
  if (!draft.lockoutEnabled) return {};
  const errors: FieldErrors = {};
  const threshold = Number(draft.lockoutThreshold);
  if (!WHOLE.test(draft.lockoutThreshold) || threshold < 1 || threshold > 30)
    errors.lockoutThreshold = "Lockout threshold must be between 1 and 30";
  const duration = lockoutSeconds(draft.lockoutDurationValue, draft.lockoutDurationUnit);
  if (!WHOLE.test(draft.lockoutDurationValue)) errors.lockoutDurationValue = "Required";
  else if (duration < 30 || duration > 86_400)
    errors.lockoutDurationValue = "Must be between 30 seconds and 1 day";
  const reset = lockoutSeconds(draft.lockoutCounterResetValue, draft.lockoutCounterResetUnit);
  if (!WHOLE.test(draft.lockoutCounterResetValue)) errors.lockoutCounterResetValue = "Required";
  else if (reset < 5 || reset > 3600)
    errors.lockoutCounterResetValue = "Must be between 5 seconds and 1 hour";
  return errors;
};

const UNITS = [
  { value: "s", label: "Seconds" },
  { value: "m", label: "Minutes" },
  { value: "h", label: "Hours" }
];

const LockoutFields = <D extends LockoutDraft>({
  draft,
  set
}: {
  draft: D;
  set: (patch: Partial<D>) => void;
}) => (
  <Group legend="Lockout">
    <SwitchField
      name="lockoutEnabled"
      label="Lockout"
      description={`Blocks logins for ${draft.lockoutDurationValue}${draft.lockoutDurationUnit} after ${draft.lockoutThreshold} failures in a row.`}
      checked={draft.lockoutEnabled}
      onChange={(lockoutEnabled) => set({ lockoutEnabled } as Partial<D>)}
    />
    {draft.lockoutEnabled && (
      <>
        <TextField
          name="lockoutThreshold"
          label="Lockout threshold"
          type="number"
          value={draft.lockoutThreshold}
          onChange={(lockoutThreshold) => set({ lockoutThreshold } as Partial<D>)}
        />
        <div className={css.split}>
          <TextField
            name="lockoutDurationValue"
            label="Lockout duration"
            type="number"
            value={draft.lockoutDurationValue}
            onChange={(lockoutDurationValue) => set({ lockoutDurationValue } as Partial<D>)}
          />
          <SelectField
            name="lockoutDurationUnit"
            label="Lockout duration unit"
            value={draft.lockoutDurationUnit}
            options={[...UNITS, { value: "d", label: "Days" }]}
            onChange={(lockoutDurationUnit) => set({ lockoutDurationUnit } as Partial<D>)}
          />
        </div>
        <div className={css.split}>
          <TextField
            name="lockoutCounterResetValue"
            label="Lockout counter reset"
            type="number"
            value={draft.lockoutCounterResetValue}
            onChange={(lockoutCounterResetValue) => set({ lockoutCounterResetValue } as Partial<D>)}
          />
          <SelectField
            name="lockoutCounterResetUnit"
            label="Lockout counter reset unit"
            value={draft.lockoutCounterResetUnit}
            options={UNITS}
            onChange={(lockoutCounterResetUnit) => set({ lockoutCounterResetUnit } as Partial<D>)}
          />
        </div>
      </>
    )}
  </Group>
);

const CUSTOM = "custom";

const TemplateField = ({
  authMethod,
  value,
  onChange
}: {
  authMethod: MachineIdentityAuthMethod;
  value: string;
  onChange: (templateId: string) => void;
}) => {
  const { permission } = useOrgPermission();
  const canAttach = permission.can(
    OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    OrgPermissionSubjects.MachineIdentityAuthTemplate
  );
  const { data: templates = [] } = useV4Adapter("access").useAvailableIdentityAuthTemplates(
    authMethod,
    { enabled: canAttach }
  );
  if (!templates.length && !value) return null;
  const options = [
    { value: CUSTOM, label: "Custom configuration" },
    ...templates.map((template) => ({ value: template.id, label: template.name }))
  ];
  if (value && !templates.some((template) => template.id === value))
    options.push({ value, label: "Linked template" });
  return (
    <SelectField
      name="templateId"
      label="Auth template"
      value={value || CUSTOM}
      options={options}
      onChange={(next) => onChange(next === CUSTOM ? "" : next)}
    />
  );
};

const NO_GATEWAY = "none";

const GatewayField = ({
  gatewayId,
  gatewayPoolId,
  required,
  onChange
}: {
  gatewayId: string;
  gatewayPoolId: string;
  required: boolean;
  onChange: (patch: { gatewayId: string; gatewayPoolId: string }) => void;
}) => {
  const { permission } = useOrgPermission();
  const canAttach = permission.can(
    OrgGatewayPermissionActions.AttachGateways,
    OrgPermissionSubjects.Gateway
  );
  const networking = useV4Adapter("networking");
  const { data: gateways = [] } = networking.useGateways();
  const { data: pools = [] } = networking.usePools({ enabled: canAttach });
  if (!canAttach && !gatewayId && !gatewayPoolId) return null;
  let value = NO_GATEWAY;
  if (gatewayPoolId) value = `pool:${gatewayPoolId}`;
  else if (gatewayId) value = `gateway:${gatewayId}`;
  return (
    <SelectField
      name="gatewayId"
      label={required ? "Gateway" : "Gateway (optional)"}
      placeholder="Select a gateway or gateway pool"
      value={required && value === NO_GATEWAY ? "" : value}
      options={[
        ...(required ? [] : [{ value: NO_GATEWAY, label: "No gateway" }]),
        ...gateways.map((gateway) => ({ value: `gateway:${gateway.id}`, label: gateway.name })),
        ...pools.map((pool) => ({
          value: `pool:${pool.id}`,
          label: pool.name,
          description: "Gateway pool"
        }))
      ]}
      onChange={(next) => {
        const [kind, id = ""] = next.split(":");
        onChange({
          gatewayId: kind === "gateway" ? id : "",
          gatewayPoolId: kind === "pool" ? id : ""
        });
      }}
    />
  );
};

export const orAny = (value?: string | null) => (value?.trim() ? value : "Any");

const ValueList = ({ values, empty = "Any" }: { values: string[]; empty?: string }) =>
  values.length ? (
    <span className={css.values}>
      {values.map((value, index) => (
        <span className={css.mono} key={`${value}-${index + 1}`}>
          {value}
        </span>
      ))}
    </span>
  ) : (
    empty
  );

const listValue = (value?: string | null, empty?: string) => (
  <ValueList values={splitList(value)} empty={empty} />
);

type Certificate = readonly [string, string | null | undefined];

const missingCertificates = (certificates: Certificate[]): DataListItem[] =>
  certificates.filter(([, value]) => !value?.trim()).map(([label]) => [label, "None"]);

const pairsValue = (record?: Record<string, string>) => (
  <ValueList
    values={Object.entries(record ?? {}).map(([key, value]) => `${key} = ${value}`)}
    empty="None"
  />
);

const toPairs = (record?: Record<string, string>): Pair[] =>
  Object.entries(record ?? {}).map(([key, value]) => ({ key, value }));
const fromPairs = (pairs: Pair[]) =>
  Object.fromEntries(
    pairs.filter((pair) => pair.key.trim()).map((pair) => [pair.key.trim(), pair.value.trim()])
  );

const configurationLabel = (templateId?: string | null) =>
  templateId ? "Auth template" : "Custom";

export const accessTokenItems = (config: TokenConfig): DataListItem[] => [
  ...(config.accessTokenPeriod
    ? [["Access token period (seconds)", String(config.accessTokenPeriod)] as DataListItem]
    : [
        ["Access token TTL (seconds)", String(config.accessTokenTTL)] as DataListItem,
        ["Access token max TTL (seconds)", String(config.accessTokenMaxTTL)] as DataListItem
      ]),
  [
    "Access token max number of uses",
    config.accessTokenNumUsesLimit ? String(config.accessTokenNumUsesLimit) : "Unlimited"
  ],
  ["Access token trusted IPs", <ValueList values={ipStrings(config.accessTokenTrustedIps)} />]
];

const durationLabel = (total: number, units: ("s" | "m" | "h" | "d")[]) => {
  const { value, unit } = getObjectFromSeconds(total, units);
  return `${value}${unit}`;
};

const lockoutItems = (config: LockoutConfig): DataListItem[] => [
  ["Lockout", config.lockoutEnabled ? "Enabled" : "Disabled"],
  ...(config.lockoutEnabled
    ? ([
        ["Lockout threshold", String(config.lockoutThreshold)],
        ["Lockout duration", durationLabel(config.lockoutDurationSeconds, ["s", "m", "h", "d"])],
        ["Lockout counter reset", durationLabel(config.lockoutCounterResetSeconds, ["s", "m", "h"])]
      ] as DataListItem[])
    : [])
];

const define = <C, D>(spec: MethodSpec<C, D>) => spec;

type UniversalDraft = TokenDraft &
  LockoutDraft & { accessTokenPeriod: string; clientSecretTrustedIps: string[] };

const universal = define<IdentityUniversalAuth, UniversalDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityUniversalAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    ...lockoutDraft(config),
    accessTokenPeriod: String(config?.accessTokenPeriod ?? 0),
    clientSecretTrustedIps: config ? ipStrings(config.clientSecretTrustedIps) : DEFAULT_IPS
  }),
  validate: (draft, ctx) => {
    const usesPeriod = Number(draft.accessTokenPeriod) > 0;
    const errors = { ...tokenErrors(draft, ctx.maxTtl, usesPeriod), ...lockoutErrors(draft) };
    if (!usesPeriod && !errors.accessTokenTTL && Number(draft.accessTokenTTL) < 1)
      errors.accessTokenTTL = "Access token TTL must be at least 1 second";
    if (!WHOLE.test(draft.accessTokenPeriod)) errors.accessTokenPeriod = "Enter a whole number";
    else if (Number(draft.accessTokenPeriod) > ctx.maxTtl)
      errors.accessTokenPeriod = `Access token period cannot exceed ${ttlDays(ctx.maxTtl)} days`;
    const ips = ipErrors(draft.clientSecretTrustedIps);
    if (ips) errors.clientSecretTrustedIps = ips;
    return errors;
  },
  payload: (draft) => ({
    ...tokenPayload(draft),
    ...lockoutPayload(draft),
    accessTokenPeriod: Number(draft.accessTokenPeriod),
    clientSecretTrustedIps: draft.clientSecretTrustedIps.map((ipAddress) => ({ ipAddress }))
  }),
  fields: ({ draft, set, ctx }) => (
    <>
      <TokenFields
        draft={draft}
        set={set}
        maxTtl={ctx.maxTtl}
        hideTtl={Number(draft.accessTokenPeriod) > 0}
        extraTokenFields={
          <TextField
            name="accessTokenPeriod"
            label="Access token period (seconds)"
            type="number"
            placeholder="0"
            description="Tokens renew indefinitely each period and ignore the TTL. Set to 0 to use TTL expiration."
            value={draft.accessTokenPeriod}
            onChange={(accessTokenPeriod) => set({ accessTokenPeriod })}
          />
        }
        extraIps={
          <TrustedIpsField
            name="clientSecretTrustedIps"
            label="Client secret trusted IPs"
            placeholder="0.0.0.0/0"
            validate={ipTagError}
            values={draft.clientSecretTrustedIps}
            onChange={(clientSecretTrustedIps) => set({ clientSecretTrustedIps })}
          />
        }
      />
      <LockoutFields draft={draft} set={set} />
    </>
  ),
  details: (config) => [
    ...accessTokenItems(config),
    ["Client secret trusted IPs", <ValueList values={ipStrings(config.clientSecretTrustedIps)} />],
    ...lockoutItems(config)
  ]
});

const token = define<IdentityTokenAuth, TokenDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityTokenAuth(identityId, { enabled }),
  draft: (config) => tokenDraft(config),
  validate: (draft, ctx) => tokenErrors(draft, ctx.maxTtl),
  payload: (draft) => tokenPayload(draft),
  fields: ({ draft, set, ctx }) => <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />,
  details: (config) => accessTokenItems(config)
});

type KubernetesDraft = TokenDraft & {
  templateId: string;
  tokenReviewMode: IdentityKubernetesAuthTokenReviewMode;
  kubernetesHost: string;
  tokenReviewerJwt: string;
  removeTemplateSourcedJwt: boolean;
  gatewayId: string;
  gatewayPoolId: string;
  allowedNames: string[];
  allowedNamespaces: string[];
  allowedAudience: string;
  caCert: string;
  verifyTlsCertificate: boolean;
};

const REVIEW_MODES = [
  { value: IdentityKubernetesAuthTokenReviewMode.Api, label: "Manual token reviewer JWT (API)" },
  { value: IdentityKubernetesAuthTokenReviewMode.Gateway, label: "Gateway as reviewer" }
];

const kubernetes = define<IdentityKubernetesAuth, KubernetesDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityKubernetesAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    templateId: config?.templateId ?? "",
    tokenReviewMode: config?.tokenReviewMode ?? IdentityKubernetesAuthTokenReviewMode.Api,
    kubernetesHost: config?.kubernetesHost ?? "",
    tokenReviewerJwt: "",
    removeTemplateSourcedJwt: false,
    gatewayId: config?.gatewayPoolId ? "" : (config?.gatewayId ?? ""),
    gatewayPoolId: config?.gatewayPoolId ?? "",
    allowedNames: splitList(config?.allowedNames),
    allowedNamespaces: splitList(config?.allowedNamespaces),
    allowedAudience: config?.allowedAudience ?? "",
    caCert: config?.caCert ?? "",
    verifyTlsCertificate: config ? (config.verifyTlsCertificate ?? false) : true
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (draft.templateId) return errors;
    const isApi = draft.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api;
    if (isApi && !draft.kubernetesHost.trim())
      errors.kubernetesHost =
        "When token review mode is set to API, a Kubernetes host must be provided";
    if (!isApi && !draft.gatewayId && !draft.gatewayPoolId)
      errors.gatewayId =
        "When token review mode is set to Gateway, a gateway or gateway pool must be selected";
    if (isApi && draft.verifyTlsCertificate && !draft.caCert.trim())
      errors.caCert =
        "A CA certificate is required when TLS certificate verification is enabled. Paste the Kubernetes API server's CA certificate or turn off verification.";
    if (isApi && !draft.verifyTlsCertificate && draft.caCert.trim())
      errors.verifyTlsCertificate =
        "TLS certificate verification can't be turned off while a CA certificate is set. Remove the CA certificate or turn verification on.";
    return errors;
  },
  payload: (draft, { config }) => {
    const base = {
      ...tokenPayload(draft),
      allowedNames: joinList(draft.allowedNames),
      allowedNamespaces: joinList(draft.allowedNamespaces)
    };
    if (draft.templateId) return { ...base, templateId: draft.templateId };
    const isApi = draft.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api;
    let tokenReviewerJwt: string | null | undefined = draft.tokenReviewerJwt || undefined;
    if (config && (draft.removeTemplateSourcedJwt || (!isApi && config.hasTokenReviewerJwt)))
      tokenReviewerJwt = null;
    return {
      ...base,
      ...(config?.templateId ? { templateId: null } : {}),
      kubernetesHost: isApi ? draft.kubernetesHost.trim() : null,
      allowedAudience: draft.allowedAudience.trim(),
      gatewayId: draft.gatewayPoolId ? null : draft.gatewayId || null,
      gatewayPoolId: draft.gatewayPoolId || null,
      verifyTlsCertificate: draft.verifyTlsCertificate,
      tokenReviewMode: draft.tokenReviewMode,
      tokenReviewerJwt,
      caCert: draft.caCert
    };
  },
  fields: ({ draft, set, ctx }) => {
    const isApi = draft.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api;
    const keepsJwt =
      ctx.isUpdate &&
      Boolean(ctx.config?.hasTokenReviewerJwt || ctx.config?.isTokenReviewerJwtTemplateSourced);
    return (
      <>
        <Group legend="Configuration">
          <TemplateField
            authMethod={MachineIdentityAuthMethod.KUBERNETES}
            value={draft.templateId}
            onChange={(templateId) => set({ templateId })}
          />
          {!draft.templateId && (
            <>
              <SelectField
                name="tokenReviewMode"
                label="Token review mode"
                value={draft.tokenReviewMode}
                options={REVIEW_MODES}
                onChange={(mode) =>
                  set({ tokenReviewMode: mode as IdentityKubernetesAuthTokenReviewMode })
                }
              />
              <GatewayField
                gatewayId={draft.gatewayId}
                gatewayPoolId={draft.gatewayPoolId}
                required={!isApi}
                onChange={set}
              />
              {isApi && (
                <>
                  <TextField
                    name="kubernetesHost"
                    label="Kubernetes host / base Kubernetes API URL"
                    placeholder="https://my-example-k8s-api-host.com"
                    value={draft.kubernetesHost}
                    onChange={(kubernetesHost) => set({ kubernetesHost })}
                  />
                  <TextField
                    name="tokenReviewerJwt"
                    label="Token reviewer JWT"
                    type="password"
                    optional
                    placeholder={keepsJwt ? "Leave empty to keep the current JWT" : ""}
                    description="Without one, each client's own token reviews itself."
                    value={draft.tokenReviewerJwt}
                    onChange={(tokenReviewerJwt) => set({ tokenReviewerJwt })}
                  />
                  {keepsJwt && (
                    <SwitchField
                      name="removeTemplateSourcedJwt"
                      label={
                        ctx.config?.isTokenReviewerJwtTemplateSourced
                          ? "Remove the token reviewer JWT copied from the template"
                          : "Remove the stored token reviewer JWT"
                      }
                      checked={draft.removeTemplateSourcedJwt}
                      onChange={(removeTemplateSourcedJwt) =>
                        set({
                          removeTemplateSourcedJwt,
                          ...(removeTemplateSourcedJwt ? { tokenReviewerJwt: "" } : {})
                        })
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
        </Group>
        <Group legend="Bindings">
          <ListField
            name="allowedNamespaces"
            label="Allowed namespaces"
            optional
            placeholder="namespaceA, dev-*"
            values={draft.allowedNamespaces}
            onChange={(allowedNamespaces) => set({ allowedNamespaces })}
          />
          <ListField
            name="allowedNames"
            label="Allowed service account names"
            optional
            placeholder="service-account-1-name, sa-*"
            values={draft.allowedNames}
            onChange={(allowedNames) => set({ allowedNames })}
          />
          {!draft.templateId && (
            <TextField
              name="allowedAudience"
              label="Allowed audience"
              optional
              placeholder="https://kubernetes.default.svc"
              value={draft.allowedAudience}
              onChange={(allowedAudience) => set({ allowedAudience })}
            />
          )}
        </Group>
        {!draft.templateId && isApi && (
          <Group legend="TLS">
            <SwitchField
              name="verifyTlsCertificate"
              label="Verify TLS certificate"
              checked={draft.verifyTlsCertificate}
              onChange={(verifyTlsCertificate) => set({ verifyTlsCertificate })}
            />
            <TextAreaField
              name="caCert"
              label="CA certificate"
              optional={!draft.verifyTlsCertificate}
              placeholder={CERT_PLACEHOLDER}
              value={draft.caCert}
              onChange={(caCert) => set({ caCert })}
            />
          </Group>
        )}
        <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
      </>
    );
  },
  details: (config) => {
    let gateway = "None";
    if (config.gatewayPoolId) gateway = "Gateway pool";
    else if (config.gatewayId) gateway = "Gateway";
    return [
      ["Configuration", configurationLabel(config.templateId)],
      ["Kubernetes host / base Kubernetes API URL", orAny(config.kubernetesHost)],
      [
        "Token review mode",
        config.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway
          ? "Gateway as reviewer"
          : "Manual token reviewer JWT (API)"
      ],
      ["Gateway", gateway],
      ["Token reviewer JWT", config.hasTokenReviewerJwt ? "Set" : "Not set"],
      ["Allowed service account names", listValue(config.allowedNames)],
      ["Allowed namespaces", listValue(config.allowedNamespaces)],
      ["Allowed audience", orAny(config.allowedAudience)],
      ["Verify TLS certificate", config.verifyTlsCertificate ? "Yes" : "No"],
      ...missingCertificates([["CA certificate", config.caCert]]),
      ...accessTokenItems(config)
    ];
  },
  certificates: (config) => [["CA certificate", config.caCert]]
});

type AwsDraft = TokenDraft & {
  stsEndpoint: string;
  allowedPrincipalArns: string[];
  allowedAccountIds: string[];
};

const aws = define<IdentityAwsAuth, AwsDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityAwsAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    stsEndpoint: config?.stsEndpoint ?? "https://sts.amazonaws.com/",
    allowedPrincipalArns: splitList(config?.allowedPrincipalArns),
    allowedAccountIds: splitList(config?.allowedAccountIds)
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (!draft.allowedPrincipalArns.length && !draft.allowedAccountIds.length) {
      const message = "Configure at least one allowed AWS account ID or principal ARN";
      errors.allowedPrincipalArns = message;
      errors.allowedAccountIds = message;
    }
    if (!draft.stsEndpoint.trim()) errors.stsEndpoint = "Enter an STS endpoint";
    return errors;
  },
  payload: (draft) => ({
    ...tokenPayload(draft),
    stsEndpoint: draft.stsEndpoint.trim(),
    allowedPrincipalArns: joinList(draft.allowedPrincipalArns),
    allowedAccountIds: joinList(draft.allowedAccountIds)
  }),
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <ListField
          name="allowedPrincipalArns"
          label="Allowed principal ARNs"
          placeholder="arn:aws:iam::123456789012:role/MyRoleName"
          values={draft.allowedPrincipalArns}
          onChange={(allowedPrincipalArns) => set({ allowedPrincipalArns })}
        />
        <ListField
          name="allowedAccountIds"
          label="Allowed account IDs"
          placeholder="123456789012"
          values={draft.allowedAccountIds}
          onChange={(allowedAccountIds) => set({ allowedAccountIds })}
        />
        <TextField
          name="stsEndpoint"
          label="STS endpoint"
          placeholder="https://sts.amazonaws.com/"
          value={draft.stsEndpoint}
          onChange={(stsEndpoint) => set({ stsEndpoint })}
        />
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    ["Allowed principal ARNs", listValue(config.allowedPrincipalArns)],
    ["Allowed account IDs", listValue(config.allowedAccountIds)],
    ["STS endpoint", config.stsEndpoint],
    ...accessTokenItems(config)
  ]
});

type GcpDraft = TokenDraft & {
  type: "iam" | "gce";
  allowedServiceAccounts: string[];
  allowedProjects: string[];
  allowedZones: string[];
};

const gcp = define<IdentityGcpAuth, GcpDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityGcpAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    type: config?.type ?? "gce",
    allowedServiceAccounts: splitList(config?.allowedServiceAccounts),
    allowedProjects: splitList(config?.allowedProjects),
    allowedZones: splitList(config?.allowedZones)
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    const isGce = draft.type === "gce";
    if (!draft.allowedServiceAccounts.length && !(isGce && draft.allowedProjects.length)) {
      const message = isGce
        ? "Configure at least one allowed service account or project"
        : "Configure at least one allowed service account";
      errors.allowedServiceAccounts = message;
      if (isGce) errors.allowedProjects = message;
    }
    return errors;
  },
  payload: (draft) => ({
    ...tokenPayload(draft),
    type: draft.type,
    allowedServiceAccounts: joinList(draft.allowedServiceAccounts),
    allowedProjects: draft.type === "gce" ? joinList(draft.allowedProjects) : "",
    allowedZones: draft.type === "gce" ? joinList(draft.allowedZones) : ""
  }),
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <SelectField
          name="type"
          label="Type"
          value={draft.type}
          options={[
            { value: "gce", label: "GCP ID Token Auth (recommended)" },
            { value: "iam", label: "GCP IAM Auth" }
          ]}
          onChange={(type) => set({ type: type as GcpDraft["type"] })}
        />
        <ListField
          name="allowedServiceAccounts"
          label="Allowed service account emails"
          placeholder="test@project.iam.gserviceaccount.com"
          values={draft.allowedServiceAccounts}
          onChange={(allowedServiceAccounts) => set({ allowedServiceAccounts })}
        />
        {draft.type === "gce" && (
          <>
            <ListField
              name="allowedProjects"
              label="Allowed projects"
              placeholder="my-gcp-project"
              values={draft.allowedProjects}
              onChange={(allowedProjects) => set({ allowedProjects })}
            />
            <ListField
              name="allowedZones"
              label="Allowed zones"
              optional
              placeholder="us-west2-a"
              values={draft.allowedZones}
              onChange={(allowedZones) => set({ allowedZones })}
            />
          </>
        )}
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    ["Type", config.type === "gce" ? "GCP ID Token Auth" : "GCP IAM Auth"],
    ["Allowed service account emails", listValue(config.allowedServiceAccounts)],
    ...(config.type === "gce"
      ? ([
          ["Allowed projects", listValue(config.allowedProjects)],
          ["Allowed zones", listValue(config.allowedZones)]
        ] as DataListItem[])
      : []),
    ...accessTokenItems(config)
  ]
});

type AzureDraft = TokenDraft & {
  tenantId: string;
  resource: string;
  allowedServicePrincipalIds: string[];
};

const azure = define<IdentityAzureAuth, AzureDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityAzureAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    tenantId: config?.tenantId ?? "",
    resource: config?.resource ?? "https://management.azure.com/",
    allowedServicePrincipalIds: splitList(config?.allowedServicePrincipalIds)
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (!draft.tenantId.trim()) errors.tenantId = "Enter a tenant ID";
    return errors;
  },
  payload: (draft) => ({
    ...tokenPayload(draft),
    tenantId: draft.tenantId.trim(),
    resource: draft.resource.trim(),
    allowedServicePrincipalIds: joinList(draft.allowedServicePrincipalIds)
  }),
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <TextField
          name="tenantId"
          label="Tenant ID"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={draft.tenantId}
          onChange={(tenantId) => set({ tenantId })}
        />
        <TextField
          name="resource"
          label="Resource / audience"
          placeholder="https://management.azure.com/"
          value={draft.resource}
          onChange={(resource) => set({ resource })}
        />
        <ListField
          name="allowedServicePrincipalIds"
          label="Allowed service principal IDs"
          optional
          placeholder="00000000-0000-0000-0000-000000000000"
          values={draft.allowedServicePrincipalIds}
          onChange={(allowedServicePrincipalIds) => set({ allowedServicePrincipalIds })}
        />
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    ["Tenant ID", config.tenantId],
    ["Resource / audience", config.resource],
    ["Allowed service principal IDs", listValue(config.allowedServicePrincipalIds)],
    ...accessTokenItems(config)
  ]
});

type AliCloudDraft = TokenDraft & { allowedArns: string[] };

const aliCloud = define<IdentityAliCloudAuth, AliCloudDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityAliCloudAuth(identityId, { enabled }),
  draft: (config) => ({ ...tokenDraft(config), allowedArns: splitList(config?.allowedArns) }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (!draft.allowedArns.length) errors.allowedArns = "Add at least one allowed ARN";
    return errors;
  },
  payload: (draft) => ({ ...tokenPayload(draft), allowedArns: joinList(draft.allowedArns) }),
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <ListField
          name="allowedArns"
          label="Allowed ARNs"
          placeholder="acs:ram::0000000000000000:user/user1"
          values={draft.allowedArns}
          onChange={(allowedArns) => set({ allowedArns })}
        />
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    ["Allowed ARNs", listValue(config.allowedArns)],
    ...accessTokenItems(config)
  ]
});

type OciDraft = TokenDraft & { tenancyOcid: string; allowedUsernames: string[] };

const oci = define<IdentityOciAuth, OciDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityOciAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    tenancyOcid: config?.tenancyOcid ?? "",
    allowedUsernames: splitList(config?.allowedUsernames)
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (!draft.tenancyOcid.trim()) errors.tenancyOcid = "Enter a tenancy OCID";
    else if (!/^ocid1\.tenancy\.oc1\..+$/.test(draft.tenancyOcid.trim()))
      errors.tenancyOcid = "Tenancy OCIDs start with ocid1.tenancy.oc1.";
    return errors;
  },
  payload: (draft) => ({
    ...tokenPayload(draft),
    tenancyOcid: draft.tenancyOcid.trim(),
    allowedUsernames: draft.allowedUsernames.length ? joinList(draft.allowedUsernames) : null
  }),
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <TextField
          name="tenancyOcid"
          label="Tenancy OCID"
          placeholder="ocid1.tenancy.oc1..example"
          value={draft.tenancyOcid}
          onChange={(tenancyOcid) => set({ tenancyOcid })}
        />
        <ListField
          name="allowedUsernames"
          label="Allowed usernames"
          optional
          placeholder="user1"
          values={draft.allowedUsernames}
          onChange={(allowedUsernames) => set({ allowedUsernames })}
        />
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    ["Tenancy OCID", config.tenancyOcid],
    ["Allowed usernames", listValue(config.allowedUsernames)],
    ...accessTokenItems(config)
  ]
});

type ClaimsDraft = {
  boundIssuer: string;
  boundAudiences: string;
  boundClaims: Pair[];
  boundSubject: string;
};

const ClaimsFields = <D extends ClaimsDraft>({
  draft,
  set,
  showIssuer
}: {
  draft: D;
  set: (patch: Partial<D>) => void;
  showIssuer: boolean;
}) => (
  <Group legend="Bindings">
    {showIssuer && (
      <TextField
        name="boundIssuer"
        label="Issuer"
        placeholder="https://token.actions.githubusercontent.com"
        value={draft.boundIssuer}
        onChange={(boundIssuer) => set({ boundIssuer } as Partial<D>)}
      />
    )}
    <TextField
      name="boundSubject"
      label="Subject"
      optional
      placeholder="repo:octo-org/octo-repo:environment:prod"
      value={draft.boundSubject}
      onChange={(boundSubject) => set({ boundSubject } as Partial<D>)}
    />
    {showIssuer && (
      <TextField
        name="boundAudiences"
        label="Audiences"
        optional
        placeholder="service1, service2"
        value={draft.boundAudiences}
        onChange={(boundAudiences) => set({ boundAudiences } as Partial<D>)}
      />
    )}
    <PairsField
      name="boundClaims"
      label="Claims"
      keyLabel="Claim"
      valueLabel="Claim values"
      keyPlaceholder="property"
      valuePlaceholder="value1, value2"
      addLabel="Add claim"
      pairs={draft.boundClaims}
      onChange={(boundClaims) => set({ boundClaims } as Partial<D>)}
    />
  </Group>
);

type OidcDraft = TokenDraft &
  ClaimsDraft & {
    templateId: string;
    oidcDiscoveryUrl: string;
    caCert: string;
    claimMetadataMapping: Pair[];
  };

const oidc = define<IdentityOidcAuth, OidcDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityOidcAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    templateId: config?.templateId ?? "",
    oidcDiscoveryUrl: config?.oidcDiscoveryUrl ?? "",
    caCert: config?.caCert ?? "",
    boundIssuer: config?.boundIssuer ?? "",
    boundAudiences: config?.boundAudiences ?? "",
    boundClaims: toPairs(config?.boundClaims),
    claimMetadataMapping: toPairs(config?.claimMetadataMapping),
    boundSubject: config?.boundSubject ?? ""
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (draft.templateId) {
      if (!draft.boundSubject.trim() && !draft.boundClaims.some((claim) => claim.key.trim()))
        errors.boundSubject =
          "Set a subject or at least one claim so only specific workloads can authenticate as this identity";
      return errors;
    }
    const url = draft.oidcDiscoveryUrl.trim();
    if (!url) errors.oidcDiscoveryUrl = "Enter an OIDC discovery URL";
    else if (!isUrl(url)) errors.oidcDiscoveryUrl = "Enter a valid URL";
    else if (url.endsWith("/.well-known/openid-configuration"))
      errors.oidcDiscoveryUrl = "Remove /.well-known/openid-configuration from the URL";
    if (!draft.boundIssuer.trim()) errors.boundIssuer = "Enter an issuer";
    return errors;
  },
  payload: (draft, { config }) => {
    const base = {
      ...tokenPayload(draft),
      boundClaims: fromPairs(draft.boundClaims),
      claimMetadataMapping: fromPairs(draft.claimMetadataMapping),
      boundSubject: draft.boundSubject.trim()
    };
    if (draft.templateId) return { ...base, templateId: draft.templateId };
    return {
      ...base,
      ...(config?.templateId ? { templateId: null } : {}),
      oidcDiscoveryUrl: draft.oidcDiscoveryUrl.trim(),
      caCert: draft.caCert.trim(),
      boundIssuer: draft.boundIssuer.trim(),
      boundAudiences: draft.boundAudiences.trim()
    };
  },
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <TemplateField
          authMethod={MachineIdentityAuthMethod.OIDC}
          value={draft.templateId}
          onChange={(templateId) => set({ templateId })}
        />
        {!draft.templateId && (
          <>
            <TextField
              name="oidcDiscoveryUrl"
              label="OIDC discovery URL"
              placeholder="https://token.actions.githubusercontent.com"
              value={draft.oidcDiscoveryUrl}
              onChange={(oidcDiscoveryUrl) => set({ oidcDiscoveryUrl })}
            />
            <TextAreaField
              name="caCert"
              label="CA certificate"
              optional
              placeholder={CERT_PLACEHOLDER}
              value={draft.caCert}
              onChange={(caCert) => set({ caCert })}
            />
          </>
        )}
      </Group>
      <ClaimsFields draft={draft} set={set} showIssuer={!draft.templateId} />
      <Group legend="Claim metadata">
        <PairsField
          name="claimMetadataMapping"
          label="Claim metadata mapping"
          keyLabel="Field name"
          valueLabel="Token claim"
          keyPlaceholder="Field name"
          valuePlaceholder="Token claim"
          addLabel="Add mapping"
          pairs={draft.claimMetadataMapping}
          onChange={(claimMetadataMapping) => set({ claimMetadataMapping })}
        />
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    ["Configuration", configurationLabel(config.templateId)],
    ["OIDC discovery URL", config.oidcDiscoveryUrl],
    ["Issuer", config.boundIssuer],
    ...missingCertificates([["CA certificate", config.caCert]]),
    ["Subject", orAny(config.boundSubject)],
    ["Audiences", listValue(config.boundAudiences)],
    ["Claims", pairsValue(config.boundClaims)],
    ["Claim metadata mapping", pairsValue(config.claimMetadataMapping)],
    ...accessTokenItems(config)
  ],
  certificates: (config) => [["CA certificate", config.caCert]]
});

type JwtDraft = TokenDraft &
  ClaimsDraft & {
    configurationType: IdentityJwtConfigurationType;
    jwksUrl: string;
    jwksCaCert: string;
    publicKeys: string[];
  };

const jwt = define<IdentityJwtAuth, JwtDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityJwtAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    configurationType: config?.configurationType ?? IdentityJwtConfigurationType.JWKS,
    jwksUrl: config?.jwksUrl ?? "",
    jwksCaCert: config?.jwksCaCert ?? "",
    publicKeys: config?.publicKeys?.length ? config.publicKeys : [""],
    boundIssuer: config?.boundIssuer ?? "",
    boundAudiences: config?.boundAudiences ?? "",
    boundClaims: toPairs(config?.boundClaims),
    boundSubject: config?.boundSubject ?? ""
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (draft.configurationType === IdentityJwtConfigurationType.JWKS) {
      if (!isUrl(draft.jwksUrl.trim())) errors.jwksUrl = "Enter a valid JWKS URL";
    } else if (!draft.publicKeys.some((key) => key.trim()))
      errors.publicKeys = "Add at least one public key";
    return errors;
  },
  payload: (draft) => ({
    ...tokenPayload(draft),
    configurationType: draft.configurationType,
    jwksUrl: draft.jwksUrl.trim(),
    jwksCaCert: draft.jwksCaCert.trim(),
    publicKeys: draft.publicKeys.map((key) => key.trim()).filter(Boolean),
    boundIssuer: draft.boundIssuer.trim(),
    boundAudiences: draft.boundAudiences.trim(),
    boundClaims: fromPairs(draft.boundClaims),
    boundSubject: draft.boundSubject.trim()
  }),
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <SelectField
          name="configurationType"
          label="Configuration type"
          value={draft.configurationType}
          options={[
            { value: IdentityJwtConfigurationType.JWKS, label: "JWKS" },
            { value: IdentityJwtConfigurationType.STATIC, label: "Static" }
          ]}
          onChange={(type) => set({ configurationType: type as IdentityJwtConfigurationType })}
        />
        {draft.configurationType === IdentityJwtConfigurationType.JWKS ? (
          <>
            <TextField
              name="jwksUrl"
              label="JWKS URL"
              placeholder="https://example.com/.well-known/jwks.json"
              value={draft.jwksUrl}
              onChange={(jwksUrl) => set({ jwksUrl })}
            />
            <TextAreaField
              name="jwksCaCert"
              label="JWKS CA certificate"
              optional
              placeholder={CERT_PLACEHOLDER}
              value={draft.jwksCaCert}
              onChange={(jwksCaCert) => set({ jwksCaCert })}
            />
          </>
        ) : (
          <TextListField
            name="publicKeys"
            label="Public keys"
            placeholder="-----BEGIN PUBLIC KEY----- ..."
            addLabel="Add public key"
            values={draft.publicKeys}
            onChange={(publicKeys) => set({ publicKeys })}
          />
        )}
      </Group>
      <ClaimsFields draft={draft} set={set} showIssuer />
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    [
      "Configuration type",
      config.configurationType === IdentityJwtConfigurationType.JWKS ? "JWKS" : "Static"
    ],
    ...(config.configurationType === IdentityJwtConfigurationType.JWKS
      ? ([
          ["JWKS URL", config.jwksUrl],
          ...missingCertificates([["JWKS CA certificate", config.jwksCaCert]])
        ] as DataListItem[])
      : []),
    ["Issuer", orAny(config.boundIssuer)],
    ["Subject", orAny(config.boundSubject)],
    ["Audiences", listValue(config.boundAudiences)],
    ["Claims", pairsValue(config.boundClaims)],
    ...accessTokenItems(config)
  ],
  certificates: (config) =>
    config.configurationType === IdentityJwtConfigurationType.JWKS
      ? [["JWKS CA certificate", config.jwksCaCert]]
      : config.publicKeys.map((key, index) => [`Public key ${index + 1}`, key] as const)
});

type LdapDraft = TokenDraft &
  LockoutDraft & {
    templateId: string;
    url: string;
    bindDN: string;
    bindPass: string;
    searchBase: string;
    searchFilter: string;
    ldapCaCertificate: string;
    allowAnyUser: boolean;
    allowedFields: Pair[];
  };

const normalizeUrl = (value?: string) => (value ?? "").trim().replace(/\/+$/, "").toLowerCase();

const ldap = define<IdentityLdapAuth, LdapDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityLdapAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    ...lockoutDraft(config),
    templateId: config?.templateId ?? "",
    url: config?.url ?? "",
    bindDN: config?.bindDN ?? "",
    bindPass: "",
    searchBase: config?.searchBase ?? "",
    searchFilter: config?.searchFilter ?? "(uid={{username}})",
    ldapCaCertificate: config?.ldapCaCertificate ?? "",
    allowAnyUser: Boolean(config && !config.allowedFields?.length),
    allowedFields: config?.allowedFields?.length ? config.allowedFields : [{ key: "", value: "" }]
  }),
  validate: (draft, { isUpdate, config, maxTtl }) => {
    const errors = { ...tokenErrors(draft, maxTtl), ...lockoutErrors(draft) };
    if (!draft.searchFilter.trim()) errors.searchFilter = "Enter a search filter";
    if (!draft.allowAnyUser) {
      if (!draft.allowedFields.length)
        errors.allowedFields = "Add at least one required attribute, or allow any directory user";
      else if (draft.allowedFields.some((field) => !field.key.trim() || !field.value.trim()))
        errors.allowedFields = "Every attribute needs a key and a value";
    }
    if (draft.templateId) return errors;
    if (!draft.url.trim()) errors.url = "Enter an LDAP URL";
    if (!draft.bindDN.trim()) errors.bindDN = "Enter a bind DN";
    if (!draft.bindPass && (!isUpdate || normalizeUrl(draft.url) !== normalizeUrl(config?.url)))
      errors.bindPass = isUpdate
        ? "Enter the bind password again when the LDAP URL changes"
        : "Enter a bind password";
    if (!draft.searchBase.trim()) errors.searchBase = "Enter a search base";
    return errors;
  },
  payload: (draft, { isUpdate }) => {
    const base = {
      ...tokenPayload(draft),
      ...lockoutPayload(draft),
      searchFilter: draft.searchFilter.trim(),
      ...(isUpdate ? {} : { ldapCaCertificate: draft.ldapCaCertificate.trim() || undefined }),
      allowedFields: draft.allowAnyUser
        ? []
        : draft.allowedFields.map((field) => ({
            key: field.key.trim(),
            value: field.value.replace(/\s/g, "")
          }))
    };
    if (draft.templateId) return { ...base, templateId: draft.templateId };
    return {
      ...base,
      url: draft.url.trim(),
      bindDN: draft.bindDN.trim(),
      ...(draft.bindPass ? { bindPass: draft.bindPass } : {}),
      searchBase: draft.searchBase.trim()
    };
  },
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Connection">
        <TemplateField
          authMethod={MachineIdentityAuthMethod.LDAP}
          value={draft.templateId}
          onChange={(templateId) => set({ templateId })}
        />
        {!draft.templateId && (
          <>
            <TextField
              name="url"
              label="LDAP URL"
              placeholder="ldaps://domain-or-ip:636"
              value={draft.url}
              onChange={(url) => set({ url })}
            />
            <TextField
              name="bindDN"
              label="Bind DN"
              placeholder="cn=infisical,ou=Users,dc=example,dc=com"
              value={draft.bindDN}
              onChange={(bindDN) => set({ bindDN })}
            />
            <TextField
              name="bindPass"
              label="Bind password"
              type="password"
              placeholder={ctx.isUpdate ? "Leave empty to keep the current password" : "********"}
              value={draft.bindPass}
              onChange={(bindPass) => set({ bindPass })}
            />
            <TextField
              name="searchBase"
              label="Search base / DN"
              placeholder="ou=machines,dc=acme,dc=com"
              value={draft.searchBase}
              onChange={(searchBase) => set({ searchBase })}
            />
          </>
        )}
        <TextField
          name="searchFilter"
          label="Search filter"
          placeholder="(uid={{username}})"
          value={draft.searchFilter}
          onChange={(searchFilter) => set({ searchFilter })}
        />
        <TextAreaField
          name="ldapCaCertificate"
          label="CA certificate"
          optional
          readOnly={ctx.isUpdate}
          placeholder={ctx.isUpdate ? undefined : CERT_PLACEHOLDER}
          value={draft.ldapCaCertificate}
          onChange={(ldapCaCertificate) => set({ ldapCaCertificate })}
        />
      </Group>
      <Group legend="User access">
        <SwitchField
          name="allowAnyUser"
          label="Allow any directory user"
          checked={draft.allowAnyUser}
          onChange={(allowAnyUser) => set({ allowAnyUser })}
        />
        {!draft.allowAnyUser && (
          <PairsField
            name="allowedFields"
            label="Required attributes"
            keyLabel="Attribute"
            valueLabel="Allowed values"
            keyPlaceholder="uid"
            valuePlaceholder="userid1,userid2"
            addLabel="Add attribute"
            pairs={draft.allowedFields}
            onChange={(allowedFields) => set({ allowedFields })}
          />
        )}
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
      <LockoutFields draft={draft} set={set} />
    </>
  ),
  details: (config) => [
    ["Configuration", configurationLabel(config.templateId)],
    ["LDAP URL", orAny(config.url)],
    ["Bind DN", orAny(config.bindDN)],
    ["Search base / DN", orAny(config.searchBase)],
    ["Search filter", config.searchFilter],
    ...missingCertificates([["CA certificate", config.ldapCaCertificate]]),
    [
      "Required attributes",
      <ValueList
        values={(config.allowedFields ?? []).map((field) => `${field.key} = ${field.value}`)}
        empty="Any directory user"
      />
    ],
    ...accessTokenItems(config),
    ...lockoutItems(config)
  ],
  certificates: (config) => [["CA certificate", config.ldapCaCertificate]]
});

type TlsDraft = TokenDraft & {
  caCertificate: string;
  allowedCommonNames: string[];
  allowedSubjectAltNames: string[];
  verifyClientCertificateChain: boolean;
  bindAccessTokenToCertificate: boolean;
};

const tlsCert = define<IdentityTlsCertAuth, TlsDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentityTlsCertAuth(identityId, { enabled }),
  draft: (config) => ({
    ...tokenDraft(config),
    caCertificate: config?.caCertificate ?? "",
    allowedCommonNames: splitList(config?.allowedCommonNames),
    allowedSubjectAltNames: config?.allowedSubjectAltNames ?? [],
    verifyClientCertificateChain: config?.verifyClientCertificateChain ?? false,
    bindAccessTokenToCertificate: config?.bindAccessTokenToCertificate ?? false
  }),
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (!draft.caCertificate.trim()) errors.caCertificate = "Paste the CA certificate";
    return errors;
  },
  payload: (draft, { isUpdate }) => {
    const empty = isUpdate ? null : undefined;
    return {
      ...tokenPayload(draft),
      caCertificate: draft.caCertificate.trim(),
      allowedCommonNames: draft.allowedCommonNames.length
        ? joinList(draft.allowedCommonNames)
        : empty,
      allowedSubjectAltNames: draft.allowedSubjectAltNames.length
        ? draft.allowedSubjectAltNames
        : empty,
      verifyClientCertificateChain: draft.verifyClientCertificateChain,
      bindAccessTokenToCertificate: draft.bindAccessTokenToCertificate
    };
  },
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <TextAreaField
          name="caCertificate"
          label="CA certificate"
          rows={6}
          placeholder={CERT_PLACEHOLDER}
          value={draft.caCertificate}
          onChange={(caCertificate) => set({ caCertificate })}
        />
        <ListField
          name="allowedCommonNames"
          label="Allowed common names"
          optional
          placeholder="service.example.com"
          values={draft.allowedCommonNames}
          onChange={(allowedCommonNames) => set({ allowedCommonNames })}
        />
        <ListField
          name="allowedSubjectAltNames"
          label="Allowed subject alternative names"
          optional
          placeholder="URI:spiffe://example.org/svc"
          values={draft.allowedSubjectAltNames}
          onChange={(allowedSubjectAltNames) => set({ allowedSubjectAltNames })}
        />
        <SwitchField
          name="verifyClientCertificateChain"
          label="Verify client certificate chain"
          checked={draft.verifyClientCertificateChain}
          onChange={(verifyClientCertificateChain) => set({ verifyClientCertificateChain })}
        />
        <SwitchField
          name="bindAccessTokenToCertificate"
          label="Bind access tokens to the client certificate"
          checked={draft.bindAccessTokenToCertificate}
          onChange={(bindAccessTokenToCertificate) => set({ bindAccessTokenToCertificate })}
        />
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => [
    ["Allowed common names", listValue(config.allowedCommonNames)],
    [
      "Allowed subject alternative names",
      <ValueList values={config.allowedSubjectAltNames ?? []} />
    ],
    ["Verify client certificate chain", config.verifyClientCertificateChain ? "Yes" : "No"],
    [
      "Bind access tokens to the client certificate",
      config.bindAccessTokenToCertificate ? "Yes" : "No"
    ],
    ...accessTokenItems(config)
  ],
  certificates: (config) => [["CA certificate", config.caCertificate]]
});

type SpiffeDraft = TokenDraft & {
  trustDomain: string;
  allowedSpiffeIds: string[];
  allowedAudiences: string[];
  profile: SpiffeTrustBundleProfile;
  bundle: string;
  endpointUrl: string;
  bundleCaCert: string;
  refreshHintSeconds: string;
};

const spiffe = define<IdentitySpiffeAuth, SpiffeDraft>({
  useConfig: (identityId, enabled) =>
    useV4Adapter("access").useIdentitySpiffeAuth(identityId, { enabled }),
  draft: (config) => {
    const distribution = config?.trustBundleDistribution;
    return {
      ...tokenDraft(config),
      trustDomain: config?.trustDomain ?? "",
      allowedSpiffeIds: splitList(config?.allowedSpiffeIds),
      allowedAudiences: splitList(config?.allowedAudiences),
      profile:
        (distribution?.profile as SpiffeTrustBundleProfile) ?? SpiffeTrustBundleProfile.STATIC,
      bundle: distribution?.profile === "static" ? distribution.bundle : "",
      endpointUrl: distribution?.profile === "https_web_bundle" ? distribution.endpointUrl : "",
      bundleCaCert: distribution?.profile === "https_web_bundle" ? distribution.caCert : "",
      refreshHintSeconds:
        distribution?.profile === "https_web_bundle"
          ? String(distribution.refreshHintSeconds)
          : "3600"
    };
  },
  validate: (draft, ctx) => {
    const errors = tokenErrors(draft, ctx.maxTtl);
    if (!draft.trustDomain.trim()) errors.trustDomain = "Enter a trust domain";
    if (!draft.allowedSpiffeIds.length) errors.allowedSpiffeIds = "Add at least one SPIFFE ID";
    if (!draft.allowedAudiences.length) errors.allowedAudiences = "Add at least one audience";
    if (draft.profile === SpiffeTrustBundleProfile.STATIC) {
      if (!draft.bundle.trim()) errors.bundle = "Paste the CA bundle JWKS";
    } else {
      if (!isUrl(draft.endpointUrl.trim())) errors.endpointUrl = "Enter a valid URL";
      if (!WHOLE.test(draft.refreshHintSeconds)) errors.refreshHintSeconds = "Enter a whole number";
    }
    return errors;
  },
  payload: (draft) => ({
    ...tokenPayload(draft),
    trustDomain: draft.trustDomain.trim(),
    allowedSpiffeIds: joinList(draft.allowedSpiffeIds),
    allowedAudiences: joinList(draft.allowedAudiences),
    trustBundleDistribution:
      draft.profile === SpiffeTrustBundleProfile.STATIC
        ? { profile: "static", bundle: draft.bundle.trim() }
        : {
            profile: "https_web_bundle",
            endpointUrl: draft.endpointUrl.trim(),
            caCert: draft.bundleCaCert.trim(),
            refreshHintSeconds: Number(draft.refreshHintSeconds)
          }
  }),
  fields: ({ draft, set, ctx }) => (
    <>
      <Group legend="Configuration">
        <TextField
          name="trustDomain"
          label="Trust domain"
          placeholder="example.org"
          value={draft.trustDomain}
          onChange={(trustDomain) => set({ trustDomain })}
        />
        <ListField
          name="allowedSpiffeIds"
          label="Allowed SPIFFE IDs"
          placeholder="spiffe://example.org/ns/*/sa/admin"
          values={draft.allowedSpiffeIds}
          onChange={(allowedSpiffeIds) => set({ allowedSpiffeIds })}
        />
        <ListField
          name="allowedAudiences"
          label="Allowed audiences"
          placeholder="aud1"
          values={draft.allowedAudiences}
          onChange={(allowedAudiences) => set({ allowedAudiences })}
        />
      </Group>
      <Group legend="Trust bundle">
        <SelectField
          name="profile"
          label="Trust bundle profile"
          value={draft.profile}
          options={[
            { value: SpiffeTrustBundleProfile.STATIC, label: "Static" },
            { value: SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE, label: "HTTPS web bundle" }
          ]}
          onChange={(profile) => set({ profile: profile as SpiffeTrustBundleProfile })}
        />
        {draft.profile === SpiffeTrustBundleProfile.STATIC ? (
          <TextAreaField
            name="bundle"
            label="CA bundle JWKS"
            rows={6}
            placeholder="Paste the output of spire-server bundle show -format spiffe"
            value={draft.bundle}
            onChange={(bundle) => set({ bundle })}
          />
        ) : (
          <>
            <TextField
              name="endpointUrl"
              label="Bundle endpoint URL"
              placeholder="https://spire-server:8443"
              value={draft.endpointUrl}
              onChange={(endpointUrl) => set({ endpointUrl })}
            />
            <TextAreaField
              name="bundleCaCert"
              label="Root CA certificate"
              optional
              placeholder={CERT_PLACEHOLDER}
              value={draft.bundleCaCert}
              onChange={(bundleCaCert) => set({ bundleCaCert })}
            />
            <TextField
              name="refreshHintSeconds"
              label="Bundle refresh hint (seconds)"
              type="number"
              placeholder="3600"
              value={draft.refreshHintSeconds}
              onChange={(refreshHintSeconds) => set({ refreshHintSeconds })}
            />
          </>
        )}
      </Group>
      <TokenFields draft={draft} set={set} maxTtl={ctx.maxTtl} />
    </>
  ),
  details: (config) => {
    const distribution = config.trustBundleDistribution;
    return [
      ["Trust domain", config.trustDomain],
      ["Allowed SPIFFE IDs", listValue(config.allowedSpiffeIds)],
      ["Allowed audiences", listValue(config.allowedAudiences)],
      ["Trust bundle profile", distribution.profile === "static" ? "Static" : "HTTPS web bundle"],
      ...(distribution.profile === "static"
        ? []
        : ([
            ["Bundle endpoint URL", distribution.endpointUrl],
            ...missingCertificates([["Root CA certificate", distribution.caCert]]),
            ["Bundle refresh hint (seconds)", String(distribution.refreshHintSeconds)]
          ] as DataListItem[])),
      ...accessTokenItems(config)
    ];
  },
  certificates: ({ trustBundleDistribution: distribution }) =>
    distribution.profile === "static"
      ? [["CA bundle JWKS", distribution.bundle]]
      : [["Root CA certificate", distribution.caCert]]
});

export const AUTH_METHOD_SPECS: Record<IdentityAuthMethod, MethodSpec<any, any>> = {
  [IdentityAuthMethod.UNIVERSAL_AUTH]: universal,
  [IdentityAuthMethod.TOKEN_AUTH]: token,
  [IdentityAuthMethod.KUBERNETES_AUTH]: kubernetes,
  [IdentityAuthMethod.AWS_AUTH]: aws,
  [IdentityAuthMethod.GCP_AUTH]: gcp,
  [IdentityAuthMethod.AZURE_AUTH]: azure,
  [IdentityAuthMethod.ALICLOUD_AUTH]: aliCloud,
  [IdentityAuthMethod.OCI_AUTH]: oci,
  [IdentityAuthMethod.OIDC_AUTH]: oidc,
  [IdentityAuthMethod.JWT_AUTH]: jwt,
  [IdentityAuthMethod.LDAP_AUTH]: ldap,
  [IdentityAuthMethod.TLS_CERT_AUTH]: tlsCert,
  [IdentityAuthMethod.SPIFFE_AUTH]: spiffe
};
