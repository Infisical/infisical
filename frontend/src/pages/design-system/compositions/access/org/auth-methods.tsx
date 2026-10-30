import { useState } from "react";

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
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack, Inline } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v4/ui/tabs";
import { Heading } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useAccess } from "../context";
import {
  type AuthMethod,
  authMethodNames,
  DEFAULT_UNIVERSAL_AUTH,
  type OrgIdentity,
  type UniversalAuthConfig
} from "../model";
import { Gate, Muted } from "../ui";
import { CopyButton, Value } from "./detail-parts";

import css from "./org.module.css";

export const AUTH_METHOD_ORDER: AuthMethod[] = [
  "universal",
  "token",
  ...(
    [
      "alicloud",
      "aws",
      "azure",
      "gcp",
      "jwt",
      "kubernetes",
      "ldap",
      "oci",
      "oidc",
      "spiffe",
      "tls-cert"
    ] as AuthMethod[]
  ).sort((a, b) => authMethodNames[a].localeCompare(authMethodNames[b]))
];

const MAX_TTL_DAYS = 30;

export const lockedMethods = (identity: OrgIdentity): AuthMethod[] =>
  identity.lockedOut && identity.authMethods.length ? [identity.authMethods[0]] : [];

export const LockBadge = ({ label }: { label: string }) => (
  <Tooltip content={label}>
    <Badge tone="bad" aria-label={label}>
      <Icon name="lock" size={12} />
    </Badge>
  </Tooltip>
);

const clientIdOf = (identity: OrgIdentity) => identity.id.split("-").reverse().join("-");

type Errors = Partial<Record<keyof UniversalAuthConfig, string>>;
const numberFields: (keyof UniversalAuthConfig)[] = [
  "accessTokenTTL",
  "accessTokenMaxTTL",
  "accessTokenNumUsesLimit",
  "accessTokenPeriod",
  "lockoutThreshold",
  "lockoutDurationValue",
  "lockoutCounterResetValue"
];
const lockoutFields: (keyof UniversalAuthConfig)[] = [
  "lockoutThreshold",
  "lockoutDurationValue",
  "lockoutCounterResetValue"
];

const validate = (config: UniversalAuthConfig): Errors => {
  const errors: Errors = {};
  numberFields.forEach((key) => {
    const value = config[key] as string;
    if (key === "accessTokenNumUsesLimit" && value === "") return;
    if (!/^\d+$/.test(value)) errors[key] = "Enter a whole number";
  });
  if (!errors.accessTokenTTL && Number(config.accessTokenTTL) < 1)
    errors.accessTokenTTL = "Access token TTL must be at least 1 second";
  if (!errors.accessTokenMaxTTL && Number(config.accessTokenMaxTTL) > MAX_TTL_DAYS * 86_400)
    errors.accessTokenMaxTTL = `Access token max TTL cannot exceed ${MAX_TTL_DAYS} days`;
  if (
    !errors.accessTokenTTL &&
    !errors.accessTokenMaxTTL &&
    Number(config.accessTokenTTL) > Number(config.accessTokenMaxTTL)
  )
    errors.accessTokenTTL = "Access token TTL cannot be greater than access token max TTL";
  return errors;
};

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
  onChange
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) => (
  <Stack gap={8}>
    {values.map((ip, index) => (
      <div className={css.ipRow} key={`${label}-${index + 1}`}>
        {index === 0 ? (
          <Field label={label}>
            <Input
              placeholder="123.456.789.0"
              value={ip}
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
  initial: UniversalAuthConfig;
  onSubmit: (config: UniversalAuthConfig) => void;
}) => {
  const [config, setConfig] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [tab, setTab] = useState("configuration");
  const set = <K extends keyof UniversalAuthConfig>(key: K, value: UniversalAuthConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const maxHelper = `Max: ${MAX_TTL_DAYS} days`;
  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        const next = validate(config);
        setErrors(next);
        const first = Object.keys(next)[0] as keyof UniversalAuthConfig | undefined;
        if (!first) {
          onSubmit(config);
          return;
        }
        setTab(lockoutFields.includes(first) ? "lockout" : "configuration");
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
            {Number(config.accessTokenPeriod) > 0 ? (
              <Muted>When access token period is set, TTL and max TTL are ignored.</Muted>
            ) : (
              <>
                <NumberField
                  label="Access token TTL (seconds)"
                  min={1}
                  placeholder="2592000"
                  description={maxHelper}
                  value={config.accessTokenTTL}
                  error={errors.accessTokenTTL}
                  onChange={(value) => set("accessTokenTTL", value)}
                />
                <NumberField
                  label="Access token max TTL (seconds)"
                  min={1}
                  placeholder="2592000"
                  description={maxHelper}
                  value={config.accessTokenMaxTTL}
                  error={errors.accessTokenMaxTTL}
                  onChange={(value) => set("accessTokenMaxTTL", value)}
                />
              </>
            )}
            <NumberField
              label="Access token max number of uses (optional)"
              placeholder="Unlimited uses"
              value={config.accessTokenNumUsesLimit}
              error={errors.accessTokenNumUsesLimit}
              onChange={(value) => set("accessTokenNumUsesLimit", value)}
            />
            <NumberField
              label="Access token period (seconds)"
              placeholder="0"
              description="For periodic tokens: set a period (in seconds) to allow indefinite renewal. Set to 0 to disable periodic tokens and use TTL-based expiration."
              value={config.accessTokenPeriod}
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
              description={`The lockout feature will prevent login attempts for ${config.lockoutDurationValue || "5"}${config.lockoutDurationUnit} after ${config.lockoutThreshold || "3"} consecutive login failures. If ${config.lockoutCounterResetValue || "30"}${config.lockoutCounterResetUnit} pass after the most recent failure, the lockout counter resets.`}
              checked={config.lockoutEnabled}
              onChange={(checked) => {
                if (!checked && lockoutFields.some((key) => validate(config)[key])) return;
                set("lockoutEnabled", checked);
              }}
            />
            <div className={config.lockoutEnabled ? undefined : css.dimmed}>
              <Stack gap={16}>
                <NumberField
                  label="Lockout threshold"
                  placeholder="Threshold..."
                  disabled={!config.lockoutEnabled}
                  value={config.lockoutThreshold}
                  error={errors.lockoutThreshold}
                  onChange={(value) => set("lockoutThreshold", value)}
                />
                <div className={css.split}>
                  <NumberField
                    label="Lockout duration"
                    placeholder="Duration..."
                    disabled={!config.lockoutEnabled}
                    value={config.lockoutDurationValue}
                    error={errors.lockoutDurationValue}
                    onChange={(value) => set("lockoutDurationValue", value)}
                  />
                  <Select
                    label="Lockout duration unit"
                    disabled={!config.lockoutEnabled}
                    value={config.lockoutDurationUnit}
                    options={unitOptions(true)}
                    onChange={(value) => set("lockoutDurationUnit", value)}
                  />
                </div>
                <div className={css.split}>
                  <NumberField
                    label="Lockout counter reset"
                    placeholder="Counter reset..."
                    disabled={!config.lockoutEnabled}
                    value={config.lockoutCounterResetValue}
                    error={errors.lockoutCounterResetValue}
                    onChange={(value) => set("lockoutCounterResetValue", value)}
                  />
                  <Select
                    label="Lockout counter reset unit"
                    disabled={!config.lockoutEnabled}
                    value={config.lockoutCounterResetUnit}
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
              values={config.clientSecretTrustedIps}
              onChange={(values) => set("clientSecretTrustedIps", values)}
            />
            <TrustedIps
              label="Access token trusted IPs"
              values={config.accessTokenTrustedIps}
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
  identity: OrgIdentity;
  method?: AuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { update, saved } = useAccess();
  const configured = identity.authMethods;
  const [method, setMethod] = useState<AuthMethod | undefined>(
    () => initialMethod ?? AUTH_METHOD_ORDER.find((m) => !configured.includes(m))
  );
  const isUpdate = Boolean(method && configured.includes(method));
  const formId = `auth-method-${identity.id}`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
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
                  label: authMethodNames[value],
                  disabled: configured.includes(value),
                  description: configured.includes(value) && !isUpdate ? "Configured" : undefined
                }))}
                onChange={(value) => setMethod(value as AuthMethod)}
              />
            </Field>
            {method === "universal" ? (
              <UniversalAuthForm
                key={method}
                formId={formId}
                initial={identity.universalAuth ?? DEFAULT_UNIVERSAL_AUTH}
                onSubmit={(config) => {
                  update((current) => ({
                    ...current,
                    orgIdentities: current.orgIdentities.map((item) =>
                      item.id === identity.id
                        ? {
                            ...item,
                            universalAuth: config,
                            authMethods: item.authMethods.includes("universal")
                              ? item.authMethods
                              : [...item.authMethods, "universal"]
                          }
                        : item
                    )
                  }));
                  saved(`Successfully ${isUpdate ? "updated" : "created"} auth method`);
                  onOpenChange(false);
                }}
              />
            ) : (
              method && (
                <EmptyState
                  size="sm"
                  icon="lock"
                  title={`${authMethodNames[method]} is not ported yet`}
                  description="Universal Auth is the representative auth method form in this preview."
                />
              )
            )}
          </Stack>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Gate allowed={method === "universal"} reason="Only Universal Auth is ported">
              <Button
                variant="primary"
                type="submit"
                form={formId}
                disabled={method !== "universal"}
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

export const AuthMethodViewSheet = ({
  identity,
  method,
  open,
  onOpenChange,
  onEdit,
  onRemove
}: {
  identity: OrgIdentity;
  method: AuthMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) => {
  const { can } = useAccess();
  const config = identity.universalAuth ?? DEFAULT_UNIVERSAL_AUTH;
  const locked = lockedMethods(identity).includes(method);
  const canEditAuth = can("org", "identity", "edit");
  const canDelete = can("org", "identity", "delete");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            <span className={css.value}>
              {authMethodNames[method]}
              {locked && <LockBadge label="Auth method has active lockouts" />}
            </span>
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          {method === "universal" ? (
            <Stack gap={24}>
              <DataList
                variant="props"
                items={[
                  ...(Number(config.accessTokenPeriod) > 0
                    ? [["Access token period (seconds)", config.accessTokenPeriod] as const]
                    : [
                        ["Access token TTL (seconds)", config.accessTokenTTL] as const,
                        ["Access token max TTL (seconds)", config.accessTokenMaxTTL] as const
                      ]),
                  [
                    "Access token max number of uses",
                    Number(config.accessTokenNumUsesLimit)
                      ? config.accessTokenNumUsesLimit
                      : "Unlimited"
                  ],
                  ["Access token trusted IPs", config.accessTokenTrustedIps.join(", ")],
                  ["Client secret trusted IPs", config.clientSecretTrustedIps.join(", ")],
                  ["Lockout", config.lockoutEnabled ? "Enabled" : "Disabled"],
                  ...(config.lockoutEnabled
                    ? [
                        ["Lockout threshold", config.lockoutThreshold] as const,
                        [
                          "Lockout duration",
                          `${config.lockoutDurationValue}${config.lockoutDurationUnit}`
                        ] as const,
                        [
                          "Lockout counter reset",
                          `${config.lockoutCounterResetValue}${config.lockoutCounterResetUnit}`
                        ] as const
                      ]
                    : [])
                ]}
              />
              <Stack gap={8}>
                <Heading level={3} size="subsection">
                  Client ID
                </Heading>
                <Value mono>
                  {clientIdOf(identity)}
                  <CopyButton value={clientIdOf(identity)} label="Copy client ID" />
                </Value>
              </Stack>
            </Stack>
          ) : (
            <EmptyState
              size="sm"
              icon="lock"
              title={`${authMethodNames[method]} details are not ported yet`}
              description="Universal Auth is the representative auth method in this preview."
            />
          )}
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Gate allowed={canDelete}>
              <Button variant="destructive" disabled={!canDelete} onClick={onRemove}>
                Remove
              </Button>
            </Gate>
            <Gate allowed={canEditAuth}>
              <Button variant="primary" disabled={!canEditAuth} onClick={onEdit}>
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
  identity: OrgIdentity;
  method?: AuthMethod;
  onClose: () => void;
}) => {
  const { update, saved } = useAccess();
  return (
    <AlertDialog open={Boolean(method)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText="confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`Are you sure you want to remove ${method ? authMethodNames[method] : ""} on this identity?`}
          </AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              update((current) => ({
                ...current,
                orgIdentities: current.orgIdentities.map((item) =>
                  item.id === identity.id
                    ? { ...item, authMethods: item.authMethods.filter((m) => m !== method) }
                    : item
                )
              }));
              saved("Successfully removed auth method");
              onClose();
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
