import { type ReactNode, useState } from "react";

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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Snippet } from "@app/components/v4/ui/snippet";
import { Switch } from "@app/components/v4/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v4/ui/tabs";
import { Heading } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getObjectFromSeconds } from "@app/helpers/datetime";
import {
  MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK,
  mapTrustedIpsFromServer
} from "@app/helpers/identityAuthSchemas";
import { isValidIpOrCidr } from "@app/helpers/ip";
import {
  identityAuthToNameMap,
  UNIVERSAL_AUTH_DEFAULTS
} from "@app/hooks/api/identities/constants";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type {
  ClientSecretData,
  IdentityAccessToken,
  IdentityTrustedIp,
  IdentityUniversalAuth
} from "@app/hooks/api/identities/types";

import { useV4Adapter } from "../../data/adapters";
import { useOrgId, useOrgPermission } from "../permissions";
import { formatDate } from "../roles";
import { failed, saved } from "../toast";
import { Gate, Muted, RESTRICTED } from "../ui";
import { CopyButton, Value } from "./detail-parts";

import css from "./org.module.css";

export type AuthIdentity = {
  id: string;
  name: string;
  authMethods: readonly IdentityAuthMethod[];
  activeLockoutAuthMethods?: readonly IdentityAuthMethod[];
};

export const authMethodName = (method: IdentityAuthMethod) => identityAuthToNameMap[method];

export const AUTH_METHOD_ORDER: IdentityAuthMethod[] = [
  IdentityAuthMethod.UNIVERSAL_AUTH,
  IdentityAuthMethod.TOKEN_AUTH,
  ...Object.values(IdentityAuthMethod)
    .filter(
      (method) =>
        method !== IdentityAuthMethod.UNIVERSAL_AUTH && method !== IdentityAuthMethod.TOKEN_AUTH
    )
    .sort((a, b) => authMethodName(a).localeCompare(authMethodName(b)))
];

const VIEWABLE_METHODS: IdentityAuthMethod[] = [
  IdentityAuthMethod.UNIVERSAL_AUTH,
  IdentityAuthMethod.TOKEN_AUTH,
  IdentityAuthMethod.KUBERNETES_AUTH,
  IdentityAuthMethod.AWS_AUTH,
  IdentityAuthMethod.OIDC_AUTH
];

export const canRemoveHere = (method: IdentityAuthMethod) => VIEWABLE_METHODS.includes(method);

export const sortedMethods = (methods: readonly IdentityAuthMethod[]) =>
  AUTH_METHOD_ORDER.filter((method) => methods.includes(method));

export const LockBadge = ({ label }: { label: string }) => (
  <Tooltip content={label}>
    <Badge tone="bad" aria-label={label}>
      <Icon name="lock" size={12} />
    </Badge>
  </Tooltip>
);

const MAX_TTL = MAX_IDENTITY_ACCESS_TOKEN_TTL_FALLBACK;
const MAX_TTL_DAYS = Math.floor(MAX_TTL / 86_400);

type UniversalAuthDraft = {
  accessTokenTTL: string;
  accessTokenMaxTTL: string;
  accessTokenNumUsesLimit: string;
  accessTokenPeriod: string;
  clientSecretTrustedIps: string[];
  accessTokenTrustedIps: string[];
  lockoutEnabled: boolean;
  lockoutThreshold: string;
  lockoutDurationValue: string;
  lockoutDurationUnit: string;
  lockoutCounterResetValue: string;
  lockoutCounterResetUnit: string;
};

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

const ipStrings = (list: IdentityTrustedIp[]) =>
  mapTrustedIpsFromServer(list).map((entry) => entry.ipAddress);

const draftOf = (config?: IdentityUniversalAuth): UniversalAuthDraft => {
  const defaultIps = UNIVERSAL_AUTH_DEFAULTS.accessTokenTrustedIps.map((entry) => entry.ipAddress);
  const source = config ?? UNIVERSAL_AUTH_DEFAULTS;
  const duration = getObjectFromSeconds(source.lockoutDurationSeconds, ["s", "m", "h", "d"]);
  const reset = getObjectFromSeconds(source.lockoutCounterResetSeconds, ["s", "m", "h"]);
  return {
    accessTokenTTL: String(source.accessTokenTTL),
    accessTokenMaxTTL: String(source.accessTokenMaxTTL),
    accessTokenNumUsesLimit: source.accessTokenNumUsesLimit
      ? String(source.accessTokenNumUsesLimit)
      : "",
    accessTokenPeriod: String(source.accessTokenPeriod),
    clientSecretTrustedIps: config ? ipStrings(config.clientSecretTrustedIps) : defaultIps,
    accessTokenTrustedIps: config ? ipStrings(config.accessTokenTrustedIps) : defaultIps,
    lockoutEnabled: source.lockoutEnabled,
    lockoutThreshold: String(source.lockoutThreshold),
    lockoutDurationValue: String(duration.value),
    lockoutDurationUnit: duration.unit,
    lockoutCounterResetValue: String(reset.value),
    lockoutCounterResetUnit: reset.unit
  };
};

type NumberKey =
  | "accessTokenTTL"
  | "accessTokenMaxTTL"
  | "accessTokenNumUsesLimit"
  | "accessTokenPeriod"
  | "lockoutThreshold"
  | "lockoutDurationValue"
  | "lockoutCounterResetValue";
type Errors = Partial<
  Record<NumberKey | "clientSecretTrustedIps" | "accessTokenTrustedIps", string>
>;
const numberFields: NumberKey[] = [
  "accessTokenTTL",
  "accessTokenMaxTTL",
  "accessTokenNumUsesLimit",
  "accessTokenPeriod",
  "lockoutThreshold",
  "lockoutDurationValue",
  "lockoutCounterResetValue"
];
const lockoutFields: (keyof Errors)[] = [
  "lockoutThreshold",
  "lockoutDurationValue",
  "lockoutCounterResetValue"
];
const advancedFields: (keyof Errors)[] = ["clientSecretTrustedIps", "accessTokenTrustedIps"];

const validate = (draft: UniversalAuthDraft): Errors => {
  const errors: Errors = {};
  numberFields.forEach((key) => {
    if (key === "accessTokenNumUsesLimit" && draft[key] === "") return;
    if (!/^\d+$/.test(draft[key])) errors[key] = "Enter a whole number";
  });
  (["accessTokenTTL", "accessTokenMaxTTL", "accessTokenPeriod"] as const).forEach((key) => {
    if (!errors[key] && Number(draft[key]) > MAX_TTL)
      errors[key] = `Cannot exceed ${MAX_TTL_DAYS} days`;
  });
  if (!errors.accessTokenTTL && Number(draft.accessTokenTTL) < 1)
    errors.accessTokenTTL = "Access token TTL must be at least 1 second";
  if (
    !errors.accessTokenTTL &&
    !errors.accessTokenMaxTTL &&
    Number(draft.accessTokenMaxTTL) > 0 &&
    Number(draft.accessTokenTTL) > Number(draft.accessTokenMaxTTL)
  )
    errors.accessTokenTTL = "Access token TTL cannot be greater than access token max TTL";
  if (draft.lockoutEnabled) {
    const threshold = Number(draft.lockoutThreshold);
    if (!errors.lockoutThreshold && (threshold < 1 || threshold > 30))
      errors.lockoutThreshold = "Lockout threshold must be between 1 and 30";
    if (!errors.lockoutDurationValue && Number(draft.lockoutDurationValue) < 1)
      errors.lockoutDurationValue = "Lockout duration must be at least 1";
    if (!errors.lockoutCounterResetValue && Number(draft.lockoutCounterResetValue) < 1)
      errors.lockoutCounterResetValue = "Lockout counter reset must be at least 1";
  }
  (["clientSecretTrustedIps", "accessTokenTrustedIps"] as const).forEach((key) => {
    if (draft[key].some((value) => !isValidIpOrCidr(value.trim())))
      errors[key] = "Enter a valid IPv4, IPv6, or CIDR block";
  });
  return errors;
};

const toPayload = (draft: UniversalAuthDraft) => ({
  accessTokenTTL: Number(draft.accessTokenTTL),
  accessTokenMaxTTL: Number(draft.accessTokenMaxTTL),
  accessTokenNumUsesLimit: Number(draft.accessTokenNumUsesLimit || 0),
  accessTokenPeriod: Number(draft.accessTokenPeriod),
  clientSecretTrustedIps: draft.clientSecretTrustedIps.map((value) => ({
    ipAddress: value.trim()
  })),
  accessTokenTrustedIps: draft.accessTokenTrustedIps.map((value) => ({ ipAddress: value.trim() })),
  lockoutEnabled: draft.lockoutEnabled,
  lockoutThreshold: Number(draft.lockoutThreshold),
  lockoutDurationSeconds:
    Number(draft.lockoutDurationValue) * UNIT_SECONDS[draft.lockoutDurationUnit],
  lockoutCounterResetSeconds:
    Number(draft.lockoutCounterResetValue) * UNIT_SECONDS[draft.lockoutCounterResetUnit]
});

const NumberField = ({
  label,
  value,
  error,
  placeholder,
  description,
  disabled,
  min = 0,
  onChange
}: {
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  min?: number;
  onChange: (value: string) => void;
}) => (
  <Field label={label} error={error} description={description}>
    <Input
      type="number"
      min={min}
      step={1}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      invalid={Boolean(error)}
      onChange={(event) => onChange(event.target.value)}
    />
  </Field>
);

const TrustedIps = ({
  label,
  values,
  error,
  onChange
}: {
  label: string;
  values: string[];
  error?: string;
  onChange: (values: string[]) => void;
}) => (
  <Stack gap={8}>
    {values.map((ip, index) => (
      <div className={css.ipRow} key={`${label}-${index + 1}`}>
        {index === 0 ? (
          <Field label={label} error={error}>
            <Input
              placeholder="123.456.789.0"
              value={ip}
              invalid={Boolean(error)}
              onChange={(event) =>
                onChange(values.map((item, i) => (i === index ? event.target.value : item)))
              }
            />
          </Field>
        ) : (
          <Input
            aria-label={`${label} ${index + 1}`}
            placeholder="123.456.789.0"
            value={ip}
            onChange={(event) =>
              onChange(values.map((item, i) => (i === index ? event.target.value : item)))
            }
          />
        )}
        <Gate allowed={values.length > 1} reason="At least one IP is required">
          <Button
            variant="ghost"
            size="icon"
            icon="x"
            iconOnly
            disabled={values.length <= 1}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remove trusted IP
          </Button>
        </Gate>
      </div>
    ))}
    <span className={css.start}>
      <Button
        variant="outline"
        size="xs"
        icon="plus"
        onClick={() => onChange([...values, "0.0.0.0/0"])}
      >
        Add IP address
      </Button>
    </span>
  </Stack>
);

const unitOptions = (withDays: boolean) => [
  { value: "s", label: "Seconds" },
  { value: "m", label: "Minutes" },
  { value: "h", label: "Hours" },
  ...(withDays ? [{ value: "d", label: "Days" }] : [])
];

const UniversalAuthForm = ({
  formId,
  initial,
  onSubmit
}: {
  formId: string;
  initial: UniversalAuthDraft;
  onSubmit: (draft: UniversalAuthDraft) => void;
}) => {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [tab, setTab] = useState("configuration");
  const set = <K extends keyof UniversalAuthDraft>(key: K, value: UniversalAuthDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const maxHelper = `Max: ${MAX_TTL_DAYS} days`;
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        const next = validate(draft);
        setErrors(next);
        const first = Object.keys(next)[0] as keyof Errors | undefined;
        if (!first) {
          onSubmit(draft);
          return;
        }
        if (lockoutFields.includes(first)) setTab("lockout");
        else if (advancedFields.includes(first)) setTab("advanced");
        else setTab("configuration");
      }}
    >
      <Tabs value={tab} onValueChange={setTab} variant="segmented">
        <TabsList aria-label="Universal Auth settings" variant="segmented">
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="lockout">Lockout</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value="configuration">
          <Stack gap={16}>
            {Number(draft.accessTokenPeriod) > 0 ? (
              <Muted>When access token period is set, TTL and max TTL are ignored.</Muted>
            ) : (
              <>
                <NumberField
                  label="Access token TTL (seconds)"
                  min={1}
                  placeholder="2592000"
                  description={maxHelper}
                  value={draft.accessTokenTTL}
                  error={errors.accessTokenTTL}
                  onChange={(value) => set("accessTokenTTL", value)}
                />
                <NumberField
                  label="Access token max TTL (seconds)"
                  min={1}
                  placeholder="2592000"
                  description={maxHelper}
                  value={draft.accessTokenMaxTTL}
                  error={errors.accessTokenMaxTTL}
                  onChange={(value) => set("accessTokenMaxTTL", value)}
                />
              </>
            )}
            <NumberField
              label="Access token max number of uses (optional)"
              placeholder="Unlimited uses"
              value={draft.accessTokenNumUsesLimit}
              error={errors.accessTokenNumUsesLimit}
              onChange={(value) => set("accessTokenNumUsesLimit", value)}
            />
            <NumberField
              label="Access token period (seconds)"
              placeholder="0"
              description="For periodic tokens: set a period (in seconds) to allow indefinite renewal. Set to 0 to disable periodic tokens and use TTL-based expiration."
              value={draft.accessTokenPeriod}
              error={errors.accessTokenPeriod}
              onChange={(value) => set("accessTokenPeriod", value)}
            />
          </Stack>
        </TabsContent>
        <TabsContent value="lockout">
          <Stack gap={16}>
            <Switch
              layout="row"
              label="Lockout"
              description={`The lockout feature will prevent login attempts for ${draft.lockoutDurationValue || "5"}${draft.lockoutDurationUnit} after ${draft.lockoutThreshold || "3"} consecutive login failures. If ${draft.lockoutCounterResetValue || "30"}${draft.lockoutCounterResetUnit} pass after the most recent failure, the lockout counter resets.`}
              checked={draft.lockoutEnabled}
              onChange={(checked) => set("lockoutEnabled", checked)}
            />
            <div className={draft.lockoutEnabled ? undefined : css.dimmed}>
              <Stack gap={16}>
                <NumberField
                  label="Lockout threshold"
                  placeholder="Threshold..."
                  disabled={!draft.lockoutEnabled}
                  value={draft.lockoutThreshold}
                  error={errors.lockoutThreshold}
                  onChange={(value) => set("lockoutThreshold", value)}
                />
                <div className={css.split}>
                  <NumberField
                    label="Lockout duration"
                    placeholder="Duration..."
                    disabled={!draft.lockoutEnabled}
                    value={draft.lockoutDurationValue}
                    error={errors.lockoutDurationValue}
                    onChange={(value) => set("lockoutDurationValue", value)}
                  />
                  <Select
                    label="Lockout duration unit"
                    disabled={!draft.lockoutEnabled}
                    value={draft.lockoutDurationUnit}
                    options={unitOptions(true)}
                    onChange={(value) => set("lockoutDurationUnit", value)}
                  />
                </div>
                <div className={css.split}>
                  <NumberField
                    label="Lockout counter reset"
                    placeholder="Counter reset..."
                    disabled={!draft.lockoutEnabled}
                    value={draft.lockoutCounterResetValue}
                    error={errors.lockoutCounterResetValue}
                    onChange={(value) => set("lockoutCounterResetValue", value)}
                  />
                  <Select
                    label="Lockout counter reset unit"
                    disabled={!draft.lockoutEnabled}
                    value={draft.lockoutCounterResetUnit}
                    options={unitOptions(false)}
                    onChange={(value) => set("lockoutCounterResetUnit", value)}
                  />
                </div>
              </Stack>
            </div>
          </Stack>
        </TabsContent>
        <TabsContent value="advanced">
          <Stack gap={24}>
            <TrustedIps
              label="Client secret trusted IPs"
              values={draft.clientSecretTrustedIps}
              error={errors.clientSecretTrustedIps}
              onChange={(values) => set("clientSecretTrustedIps", values)}
            />
            <TrustedIps
              label="Access token trusted IPs"
              values={draft.accessTokenTrustedIps}
              error={errors.accessTokenTrustedIps}
              onChange={(values) => set("accessTokenTrustedIps", values)}
            />
          </Stack>
        </TabsContent>
      </Tabs>
    </form>
  );
};

export const AuthMethodFormSheet = ({
  identity,
  method: initialMethod,
  open,
  onOpenChange
}: {
  identity: AuthIdentity;
  method?: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const configured = identity.authMethods;
  const [method, setMethod] = useState<IdentityAuthMethod | undefined>(
    () => initialMethod ?? AUTH_METHOD_ORDER.find((entry) => !configured.includes(entry))
  );
  const [pending, setPending] = useState(false);
  const isUpdate = Boolean(method && configured.includes(method));
  const isUniversal = method === IdentityAuthMethod.UNIVERSAL_AUTH;
  const current = access.useIdentityUniversalAuth(identity.id, {
    enabled: isUniversal && isUpdate
  });
  const add = access.useAddIdentityUniversalAuth();
  const update = access.useUpdateIdentityUniversalAuth();
  const formId = `auth-method-${identity.id}`;
  const loadingCurrent = isUniversal && isUpdate && current.isPending;

  const submit = async (draft: UniversalAuthDraft) => {
    setPending(true);
    try {
      const payload = { identityId: identity.id, organizationId: orgId, ...toPayload(draft) };
      if (isUpdate) await update.mutateAsync(payload);
      else await add.mutateAsync(payload);
      saved(`Successfully ${isUpdate ? "updated" : "created"} auth method`);
      onOpenChange(false);
    } catch (error) {
      failed(`Failed to ${isUpdate ? "update" : "create"} auth method`, error);
    } finally {
      setPending(false);
    }
  };

  let body: ReactNode = null;
  if (loadingCurrent) body = <Loader label="Loading Universal Auth" />;
  else if (isUniversal)
    body = (
      <UniversalAuthForm
        key={method}
        formId={formId}
        initial={draftOf(isUpdate ? current.data : undefined)}
        onSubmit={submit}
      />
    );
  else if (method)
    body = (
      <EmptyState
        size="sm"
        icon="lock"
        title={`${authMethodName(method)} can't be configured here yet`}
        description="Universal Auth is the only auth method you can add or edit from this page."
      />
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>{isUpdate ? "Edit auth method" : "Add auth method"}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <Stack gap={24}>
            <Field label="Auth method">
              <Select
                label="Auth method"
                placeholder="Select auth method..."
                value={method ?? ""}
                disabled={isUpdate}
                options={AUTH_METHOD_ORDER.map((value) => ({
                  value,
                  label: authMethodName(value),
                  disabled: configured.includes(value),
                  description: configured.includes(value) && !isUpdate ? "Configured" : undefined
                }))}
                onChange={(value) => setMethod(value as IdentityAuthMethod)}
              />
            </Field>
            {body}
          </Stack>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Gate
              allowed={isUniversal}
              reason="Only Universal Auth can be configured from this page"
            >
              <Button
                variant="primary"
                type="submit"
                form={formId}
                loading={pending}
                disabled={!isUniversal || loadingCurrent}
              >
                {isUpdate ? "Update" : "Add"}
              </Button>
            </Gate>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const ipList = (list: IdentityTrustedIp[]) => ipStrings(list).join(", ");
const orAny = (value?: string | null) => (value?.trim() ? value : "Any");

type Item = [string, ReactNode];

const accessTokenItems = (config: {
  accessTokenTTL: number;
  accessTokenMaxTTL: number;
  accessTokenNumUsesLimit: number;
  accessTokenTrustedIps: IdentityTrustedIp[];
  accessTokenPeriod?: number;
}): Item[] => [
  ...(config.accessTokenPeriod
    ? [["Access token period (seconds)", String(config.accessTokenPeriod)] as Item]
    : [
        ["Access token TTL (seconds)", String(config.accessTokenTTL)] as Item,
        ["Access token max TTL (seconds)", String(config.accessTokenMaxTTL)] as Item
      ]),
  [
    "Access token max number of uses",
    config.accessTokenNumUsesLimit ? String(config.accessTokenNumUsesLimit) : "Unlimited"
  ],
  ["Access token trusted IPs", ipList(config.accessTokenTrustedIps)]
];

const durationLabel = (total: number, units: ("s" | "m" | "h" | "d")[]) => {
  const { value, unit } = getObjectFromSeconds(total, units);
  return `${value}${unit}`;
};

const usesLabel = (used: number, limit: number) =>
  limit > 0 ? `${used} of ${limit} uses` : `${used} ${used === 1 ? "use" : "uses"}`;

const expiryLabel = (createdAt: string, ttlSeconds: number) => {
  if (ttlSeconds <= 0) return "never expires";
  const end = new Date(new Date(createdAt).getTime() + ttlSeconds * 1000);
  return `${end.getTime() < Date.now() ? "expired" : "expires"} ${formatDate(end)}`;
};

const ConfigState = ({ loading, name }: { loading: boolean; name: string }) =>
  loading ? (
    <Loader label={`Loading ${name}`} />
  ) : (
    <EmptyState
      size="sm"
      icon="lock"
      title={`Could not find ${name} associated with this machine identity`}
    />
  );

const CreatedSecretDialog = ({
  title,
  description,
  label,
  value,
  onClose
}: {
  title: string;
  description: string;
  label: string;
  value?: string;
  onClose: () => void;
}) => (
  <Dialog open={Boolean(value)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field label={label} wide>
        <Snippet label={label} value={value ?? ""} />
      </Field>
      <DialogFooter>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const RevokeDialog = ({
  title,
  description,
  open,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
    <AlertDialogContent tone="danger">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Revoke
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const CreateButton = ({ allowed, onClick }: { allowed: boolean; onClick: () => void }) => (
  <Gate allowed={allowed}>
    <Button variant="outline" size="sm" icon="plus" disabled={!allowed} onClick={onClick}>
      Create
    </Button>
  </Gate>
);

const RevokeButton = ({ allowed, onClick }: { allowed: boolean; onClick: () => void }) => (
  <Gate allowed={allowed}>
    <Button variant="ghost" size="sm" disabled={!allowed} onClick={onClick}>
      Revoke
    </Button>
  </Gate>
);

const ClientSecrets = ({ identityId, canEdit }: { identityId: string; canEdit: boolean }) => {
  const access = useV4Adapter("access");
  const { data: secrets = [], isPending } =
    access.useIdentityUniversalAuthClientSecrets(identityId);
  const create = access.useCreateIdentityUniversalAuthClientSecret();
  const revoke = access.useRevokeIdentityUniversalAuthClientSecret();
  const empty = { description: "", ttl: "", numUsesLimit: "" };
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<{ ttl?: string; numUsesLimit?: string }>({});
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<string>();
  const [revoking, setRevoking] = useState<ClientSecretData>();

  const close = () => {
    setCreating(false);
    setForm(empty);
    setErrors({});
  };

  const submit = async () => {
    const next = {
      ttl: form.ttl && !/^\d+$/.test(form.ttl) ? "Enter a whole number" : undefined,
      numUsesLimit:
        form.numUsesLimit && !/^\d+$/.test(form.numUsesLimit) ? "Enter a whole number" : undefined
    };
    setErrors(next);
    if (next.ttl || next.numUsesLimit) return;
    setPending(true);
    try {
      const result = await create.mutateAsync({
        identityId,
        description: form.description.trim(),
        ttl: Number(form.ttl || 0),
        numUsesLimit: Number(form.numUsesLimit || 0)
      });
      close();
      setCreated(result.clientSecret);
    } catch (error) {
      failed("Failed to create client secret", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <List
        label="Client secrets"
        title="Client secrets"
        loading={isPending}
        loadingRows={2}
        action={<CreateButton allowed={canEdit} onClick={() => setCreating(true)} />}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="key"
            title="No client secrets have been generated"
          />
        }
      >
        {secrets.map((secret) => (
          <ListRow
            key={secret.id}
            value={secret.id}
            label={secret.description || secret.clientSecretPrefix}
            title={secret.description || "No description"}
            description={
              <>
                Starts with <code>{secret.clientSecretPrefix}</code>,{" "}
                {usesLabel(secret.clientSecretNumUses, secret.clientSecretNumUsesLimit)},{" "}
                {expiryLabel(secret.createdAt, secret.clientSecretTTL)}
              </>
            }
            actions={<RevokeButton allowed={canEdit} onClick={() => setRevoking(secret)} />}
          />
        ))}
      </List>
      <Dialog open={creating} onOpenChange={(open) => !open && close()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Create client secret</DialogTitle>
            <DialogDescription>
              The client secret is shown once. Store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-client-secret"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Description (optional)">
                <Input
                  autoFocus
                  placeholder="Description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <NumberField
                label="TTL in seconds (optional)"
                placeholder="0"
                description="Leave empty or set to 0 for a client secret that never expires."
                value={form.ttl}
                error={errors.ttl}
                onChange={(ttl) => setForm({ ...form, ttl })}
              />
              <NumberField
                label="Max number of uses (optional)"
                placeholder="Unlimited uses"
                value={form.numUsesLimit}
                error={errors.numUsesLimit}
                onChange={(numUsesLimit) => setForm({ ...form, numUsesLimit })}
              />
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-client-secret" loading={pending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreatedSecretDialog
        title="Client secret created"
        description="Copy the client secret now. You won't be able to see it again."
        label="Client secret"
        value={created}
        onClose={() => setCreated(undefined)}
      />
      <RevokeDialog
        open={Boolean(revoking)}
        title={`Revoke the client secret starting with ${revoking?.clientSecretPrefix ?? ""}?`}
        description="Anything using this client secret will stop authenticating."
        onCancel={() => setRevoking(undefined)}
        onConfirm={async () => {
          if (!revoking) return;
          setRevoking(undefined);
          try {
            await revoke.mutateAsync({ identityId, clientSecretId: revoking.id });
            saved("Successfully deleted client secret");
          } catch (error) {
            failed("Failed to delete client secret", error);
          }
        }}
      />
    </>
  );
};

const AccessTokens = ({ identityId, canEdit }: { identityId: string; canEdit: boolean }) => {
  const access = useV4Adapter("access");
  const { data: tokens = [], isPending } = access.useIdentityTokenAuthTokens(identityId);
  const create = access.useCreateIdentityTokenAuthToken();
  const revoke = access.useRevokeIdentityTokenAuthToken();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<string>();
  const [revoking, setRevoking] = useState<IdentityAccessToken>();

  const close = () => {
    setCreating(false);
    setName("");
    setError(undefined);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("Required");
      return;
    }
    setPending(true);
    try {
      const result = await create.mutateAsync({ identityId, name: name.trim() });
      close();
      setCreated(result.accessToken);
    } catch (cause) {
      failed("Failed to create access token", cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <List
        label="Access tokens"
        title="Access tokens"
        loading={isPending}
        loadingRows={2}
        action={<CreateButton allowed={canEdit} onClick={() => setCreating(true)} />}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="key"
            title="No access tokens have been generated"
          />
        }
      >
        {tokens
          .filter((token) => !token.isAccessTokenRevoked)
          .map((token) => (
            <ListRow
              key={token.id}
              value={token.id}
              label={token.name || token.id}
              title={<code>{token.name || "Unnamed token"}</code>}
              description={`${usesLabel(token.accessTokenNumUses, token.accessTokenNumUsesLimit)}, ${expiryLabel(token.createdAt, token.accessTokenTTL)}`}
              actions={<RevokeButton allowed={canEdit} onClick={() => setRevoking(token)} />}
            />
          ))}
      </List>
      <Dialog open={creating} onOpenChange={(open) => !open && close()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Create access token</DialogTitle>
            <DialogDescription>
              The access token is shown once. Store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <form
            id="create-access-token"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field label="Name" error={error}>
              <Input
                autoFocus
                placeholder="My token"
                value={name}
                invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(undefined);
                }}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-access-token" loading={pending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreatedSecretDialog
        title="Access token created"
        description="Copy the access token now. You won't be able to see it again."
        label="Access token"
        value={created}
        onClose={() => setCreated(undefined)}
      />
      <RevokeDialog
        open={Boolean(revoking)}
        title={`Revoke ${revoking?.name || "this access token"}?`}
        description="Anything using this access token will stop authenticating."
        onCancel={() => setRevoking(undefined)}
        onConfirm={async () => {
          if (!revoking) return;
          setRevoking(undefined);
          try {
            await revoke.mutateAsync({ identityId, tokenId: revoking.id });
            saved(`Successfully revoked token ${revoking.name ?? ""}`.trim());
          } catch (cause) {
            failed("Failed to revoke access token", cause);
          }
        }}
      />
    </>
  );
};

const UniversalAuthView = ({
  identityId,
  locked,
  canEdit
}: {
  identityId: string;
  locked: boolean;
  canEdit: boolean;
}) => {
  const access = useV4Adapter("access");
  const { data: config, isPending } = access.useIdentityUniversalAuth(identityId);
  const clear = access.useClearIdentityUniversalAuthLockouts();
  const [clearing, setClearing] = useState(false);
  if (!config) return <ConfigState loading={isPending} name="Universal Auth" />;
  const lockoutItems: Item[] = config.lockoutEnabled
    ? [
        ["Lockout threshold", String(config.lockoutThreshold)],
        ["Lockout duration", durationLabel(config.lockoutDurationSeconds, ["s", "m", "h", "d"])],
        ["Lockout counter reset", durationLabel(config.lockoutCounterResetSeconds, ["s", "m", "h"])]
      ]
    : [];
  return (
    <Stack gap={24}>
      <DataList
        variant="props"
        items={[
          ...accessTokenItems(config),
          ["Client secret trusted IPs", ipList(config.clientSecretTrustedIps)],
          ["Lockout", config.lockoutEnabled ? "Enabled" : "Disabled"],
          ...lockoutItems
        ]}
      />
      {locked && (
        <Inline gap={8} justify="between" align="center">
          <Muted>This auth method has active lockouts.</Muted>
          <Gate allowed={canEdit}>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canEdit}
              loading={clearing}
              onClick={async () => {
                setClearing(true);
                try {
                  const count = await clear.mutateAsync({ identityId });
                  saved(`Successfully cleared ${count} lockout${count === 1 ? "" : "s"}`);
                } catch (error) {
                  failed("Failed to reset lockouts", error);
                } finally {
                  setClearing(false);
                }
              }}
            >
              Reset all lockouts
            </Button>
          </Gate>
        </Inline>
      )}
      <Stack gap={8}>
        <Heading level={3} size="subsection">
          Client ID
        </Heading>
        <Value mono>
          {config.clientId}
          <CopyButton value={config.clientId} label="Copy client ID" />
        </Value>
      </Stack>
      <ClientSecrets identityId={identityId} canEdit={canEdit} />
    </Stack>
  );
};

const TokenAuthView = ({ identityId, canEdit }: { identityId: string; canEdit: boolean }) => {
  const { data: config, isPending } = useV4Adapter("access").useIdentityTokenAuth(identityId);
  if (!config) return <ConfigState loading={isPending} name="Token Auth" />;
  return (
    <Stack gap={24}>
      <DataList variant="props" items={accessTokenItems(config)} />
      <AccessTokens identityId={identityId} canEdit={canEdit} />
    </Stack>
  );
};

const KubernetesAuthView = ({ identityId }: { identityId: string }) => {
  const { data: config, isPending } = useV4Adapter("access").useIdentityKubernetesAuth(identityId);
  if (!config) return <ConfigState loading={isPending} name="Kubernetes Auth" />;
  return (
    <DataList
      variant="props"
      items={[
        ["Configuration", config.templateId ? "Auth template" : "Custom"],
        ["Kubernetes host / base Kubernetes API URL", orAny(config.kubernetesHost)],
        ["Token review mode", config.tokenReviewMode === "gateway" ? "Gateway" : "API"],
        ["Allowed service account names", orAny(config.allowedNames)],
        ["Allowed namespaces", orAny(config.allowedNamespaces)],
        ["Allowed audience", orAny(config.allowedAudience)],
        ...accessTokenItems(config)
      ]}
    />
  );
};

const AwsAuthView = ({ identityId }: { identityId: string }) => {
  const { data: config, isPending } = useV4Adapter("access").useIdentityAwsAuth(identityId);
  if (!config) return <ConfigState loading={isPending} name="AWS Auth" />;
  return (
    <DataList
      variant="props"
      items={[
        ["Allowed principal ARNs", orAny(config.allowedPrincipalArns)],
        ["Allowed account IDs", orAny(config.allowedAccountIds)],
        ["STS endpoint", config.stsEndpoint],
        ...accessTokenItems(config)
      ]}
    />
  );
};

const OidcAuthView = ({ identityId }: { identityId: string }) => {
  const { data: config, isPending } = useV4Adapter("access").useIdentityOidcAuth(identityId);
  if (!config) return <ConfigState loading={isPending} name="OIDC Auth" />;
  const claims = Object.entries(config.boundClaims ?? {});
  return (
    <DataList
      variant="props"
      items={[
        ["Configuration", config.templateId ? "Auth template" : "Custom"],
        ["OIDC discovery URL", config.oidcDiscoveryUrl],
        ["Issuer", config.boundIssuer],
        ["Subject", orAny(config.boundSubject)],
        ["Audiences", orAny(config.boundAudiences)],
        [
          "Claims",
          claims.length ? claims.map(([key, value]) => `${key}=${value}`).join(", ") : "None"
        ],
        ...accessTokenItems(config)
      ]}
    />
  );
};

export const AuthMethodViewSheet = ({
  identity,
  method,
  open,
  onOpenChange,
  onEdit,
  onRemove
}: {
  identity: AuthIdentity;
  method: IdentityAuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const { permission } = useOrgPermission();
  const locked = Boolean(identity.activeLockoutAuthMethods?.includes(method));
  const canEditAuth = permission.can(
    OrgPermissionIdentityActions.EditAuth,
    OrgPermissionSubjects.Identity
  );
  const canEdit = permission.can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
  const canDelete = permission.can(
    OrgPermissionIdentityActions.Delete,
    OrgPermissionSubjects.Identity
  );
  const isUniversal = method === IdentityAuthMethod.UNIVERSAL_AUTH;
  const removable = canRemoveHere(method);
  const views: Partial<Record<IdentityAuthMethod, ReactNode>> = {
    [IdentityAuthMethod.UNIVERSAL_AUTH]: (
      <UniversalAuthView identityId={identity.id} locked={locked} canEdit={canEdit} />
    ),
    [IdentityAuthMethod.TOKEN_AUTH]: <TokenAuthView identityId={identity.id} canEdit={canEdit} />,
    [IdentityAuthMethod.KUBERNETES_AUTH]: <KubernetesAuthView identityId={identity.id} />,
    [IdentityAuthMethod.AWS_AUTH]: <AwsAuthView identityId={identity.id} />,
    [IdentityAuthMethod.OIDC_AUTH]: <OidcAuthView identityId={identity.id} />
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <span className={css.value}>
              {authMethodName(method)}
              {locked && <LockBadge label="Auth method has active lockouts" />}
            </span>
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          {views[method] ?? (
            <EmptyState
              size="sm"
              icon="lock"
              title={`${authMethodName(method)} details aren't available here yet`}
              description="Universal, Token, Kubernetes, AWS and OIDC Auth can be viewed from this page."
            />
          )}
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Gate
              allowed={canDelete && removable}
              reason={removable ? RESTRICTED : "This auth method can't be removed from this page"}
            >
              <Button variant="destructive" disabled={!canDelete || !removable} onClick={onRemove}>
                Remove
              </Button>
            </Gate>
            <Gate
              allowed={canEditAuth && isUniversal}
              reason={isUniversal ? RESTRICTED : "Only Universal Auth can be edited from this page"}
            >
              <Button variant="primary" disabled={!canEditAuth || !isUniversal} onClick={onEdit}>
                Edit
              </Button>
            </Gate>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const RemoveAuthMethodDialog = ({
  identity,
  method,
  onClose
}: {
  identity: AuthIdentity;
  method?: IdentityAuthMethod;
  onClose: () => void;
}) => {
  const access = useV4Adapter("access");
  const orgId = useOrgId();
  const removers: Partial<
    Record<
      IdentityAuthMethod,
      (dto: { identityId: string; organizationId: string }) => Promise<unknown>
    >
  > = {
    [IdentityAuthMethod.UNIVERSAL_AUTH]: access.useDeleteIdentityUniversalAuth().mutateAsync,
    [IdentityAuthMethod.TOKEN_AUTH]: access.useDeleteIdentityTokenAuth().mutateAsync,
    [IdentityAuthMethod.KUBERNETES_AUTH]: access.useDeleteIdentityKubernetesAuth().mutateAsync,
    [IdentityAuthMethod.AWS_AUTH]: access.useDeleteIdentityAwsAuth().mutateAsync,
    [IdentityAuthMethod.OIDC_AUTH]: access.useDeleteIdentityOidcAuth().mutateAsync
  };
  return (
    <AlertDialog open={Boolean(method)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText="confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`Are you sure you want to remove ${method ? authMethodName(method) : ""} on this identity?`}
          </AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              const remove = method ? removers[method] : undefined;
              onClose();
              if (!remove) return;
              try {
                await remove({ identityId: identity.id, organizationId: orgId });
                saved("Successfully removed auth method");
              } catch (error) {
                failed("Failed to remove auth method", error);
              }
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
