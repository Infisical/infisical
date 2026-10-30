import { useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  BotIcon,
  ChevronsLeftRightEllipsisIcon
} from "lucide-react";

import { Alert } from "@app/components/v4/ui/alert";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field, FieldError, FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Tile } from "@app/components/v4/ui/item";
import { Grid, Stack } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { Switch } from "@app/components/v4/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v4/ui/tabs";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { ProxiedServiceSubstitutionSurface } from "./managed-proxy-enums";
import {
  HeaderRewritingMode,
  type TCredentialSourceForm,
  type TProxiedServiceForm
} from "./managed-proxy-schema";
import {
  POPULAR_PROXIED_SERVICE_TEMPLATES,
  PROXIED_SERVICE_TEMPLATES,
  type ProxiedServiceTemplate,
  ProxiedServiceTemplateCategory
} from "./managed-proxy-templates";
import { ProviderLogo } from "./wizard-sheet";

import styles from "./flows.module.css";

export type ProxyErrors = Record<string, string>;
export type SourceOption = {
  value: string;
  label: string;
  meta?: string;
  disabled?: boolean;
};

export const genPlaceholder = () =>
  `placeholder_${Array.from(
    { length: 12 },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]
  ).join("")}`;

export const emptySource = (): TCredentialSourceForm => ({
  secretKey: "",
  dynamicSecretName: "",
  dynamicSecretField: ""
});

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const SURFACE_OPTIONS = Object.values(ProxiedServiceSubstitutionSurface).map((value) => ({
  value,
  label: capitalize(value)
}));

export const encodeSource = (source: TCredentialSourceForm) => {
  if (source.dynamicSecretName)
    return `dynamic:${source.dynamicSecretName}:${source.dynamicSecretField}`;
  return source.secretKey ? `secret:${source.secretKey}` : "";
};
const decodeSource = (value: string): TCredentialSourceForm => {
  if (value.startsWith("secret:")) return { ...emptySource(), secretKey: value.slice(7) };
  if (value.startsWith("dynamic:")) {
    const [, name, field] = value.split(":");
    return { secretKey: "", dynamicSecretName: name, dynamicSecretField: field };
  }
  return emptySource();
};

export function TemplatePicker({
  onSelect
}: {
  onSelect: (template: ProxiedServiceTemplate | null) => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      PROXIED_SERVICE_TEMPLATES.filter((template) =>
        [template.name, template.category, template.key, ...(template.aliases ?? [])].some((term) =>
          term.toLowerCase().includes(query)
        )
      ),
    [query]
  );
  const card = (template: ProxiedServiceTemplate) => (
    <Tile
      key={template.key}
      media={<ProviderLogo image={template.image} />}
      title={template.name}
      description={template.description}
      onClick={() => onSelect(template)}
    />
  );
  const custom = (
    <Tile
      key="custom"
      media={<Icon name="plus" />}
      title="Custom"
      description="Set up any service manually."
      onClick={() => onSelect(null)}
    />
  );
  const popular = POPULAR_PROXIED_SERVICE_TEMPLATES.map((key) =>
    PROXIED_SERVICE_TEMPLATES.find((template) => template.key === key)
  ).filter((template): template is ProxiedServiceTemplate => Boolean(template));
  return (
    <Stack gap={24}>
      <Input
        icon="search"
        aria-label="Search services"
        value={search}
        placeholder="Search services, such as OpenAI, Stripe, Telegram, GitHub..."
        onChange={(event) => setSearch(event.target.value)}
      />
      {query ? (
        <Grid gap={12} columns={3}>
          {custom}
          {filtered.map(card)}
        </Grid>
      ) : (
        <>
          <section className={styles.templateSection}>
            <p className={styles.eyebrow}>Popular</p>
            <Grid gap={12} columns={3}>
              {custom}
              {popular.map(card)}
            </Grid>
          </section>
          {Object.values(ProxiedServiceTemplateCategory).map((category) => {
            const templates = PROXIED_SERVICE_TEMPLATES.filter(
              (template) => template.category === category
            );
            if (!templates.length) return null;
            return (
              <section key={category} className={styles.templateSection}>
                <p className={styles.eyebrow}>{category}</p>
                <Grid gap={12} columns={3}>
                  {templates.map(card)}
                </Grid>
              </section>
            );
          })}
        </>
      )}
      <SmallText muted>
        Don&apos;t see the service you&apos;re looking for, or using a protocol other than HTTP?{" "}
        <a
          className={styles.inlineLink}
          target="_blank"
          rel="noopener noreferrer"
          href="https://community.infisical.com"
        >
          Let us know in the community forum
        </a>{" "}
        or{" "}
        <a
          className={styles.inlineLink}
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com/Infisical/infisical/discussions"
        >
          request it on GitHub
        </a>
        .
      </SmallText>
    </Stack>
  );
}

export function CredentialSource({
  label,
  value,
  options,
  invalid,
  onChange,
  onCreateSecret
}: {
  label: string;
  value: TCredentialSourceForm;
  options: SourceOption[];
  invalid?: boolean;
  onChange: (value: TCredentialSourceForm) => void;
  onCreateSecret: (query: string) => void;
}) {
  const selected = encodeSource(value);
  return (
    <Combobox
      label={label}
      mono
      value={selected}
      placeholder="Select a secret"
      emptyText="No secrets available"
      invalid={invalid}
      options={[...(selected ? [{ value: "clear", label: "Clear selection" }] : []), ...options]}
      onValueChange={(next) => onChange(next === "clear" ? emptySource() : decodeSource(next))}
      onCreate={(query) => onCreateSecret(query)}
    />
  );
}

export function CreateSecretDialog({
  open,
  suggestedKey,
  existing,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  suggestedKey: string;
  existing: string[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (key: string, value: string) => void;
}) {
  const [key, setKey] = useState(suggestedKey);
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<{ key?: string; value?: string }>({});
  const submit = () => {
    const next = {
      key: key.trim() ? undefined : "Secret key is required",
      value: value ? undefined : "Secret value is required"
    };
    if (!next.key && existing.includes(key.trim()))
      next.key = "A secret with this key already exists at this path";
    setErrors(next);
    if (next.key || next.value) return;
    onSubmit(key.trim(), value);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create secret</DialogTitle>
          <DialogDescription>
            The secret will be created at the current secret path.
          </DialogDescription>
        </DialogHeader>
        <form
          id="proxy-create-secret"
          noValidate
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }}
        >
          <Field label="Key" error={errors.key}>
            <Input
              mono
              autoFocus={!suggestedKey}
              value={key}
              placeholder="API_KEY"
              autoComplete="off"
              invalid={Boolean(errors.key)}
              onChange={(event) => setKey(event.target.value)}
            />
          </Field>
          <Field label="Value" error={errors.value}>
            <Input
              type="password"
              autoFocus={Boolean(suggestedKey)}
              value={value}
              autoComplete="off"
              invalid={Boolean(errors.value)}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="proxy-create-secret">
            Create and use
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DetailsFields({
  form,
  errors,
  isDuplicateName,
  onChange
}: {
  form: TProxiedServiceForm;
  errors: ProxyErrors;
  isDuplicateName: boolean;
  onChange: (value: Partial<TProxiedServiceForm>) => void;
}) {
  let nameError = errors.name;
  if (!nameError && isDuplicateName)
    nameError = "A proxied service with this name already exists in this folder.";
  return (
    <>
      <Field
        label="Service name"
        description="Lowercase letters, numbers, and hyphens only."
        error={nameError}
      >
        <Input
          value={form.name}
          placeholder="stripe-api"
          autoComplete="off"
          invalid={Boolean(nameError)}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>
      <div className={styles.valueField}>
        <div className={styles.labelRow}>
          <FieldLabel htmlFor="proxy-host-pattern">Host pattern</FieldLabel>
          <Tooltip content="The hosts whose traffic this service brokers. Separate multiple with commas, for example: api.stripe.com, *.github.com/v1/*, internal.corp.com:8443">
            <span className={styles.hint}>
              <Icon name="info" size={14} label="About host patterns" />
            </span>
          </Tooltip>
        </div>
        <Input
          id="proxy-host-pattern"
          value={form.hostPattern}
          placeholder="api.stripe.com, *.github.com/v1/*"
          invalid={Boolean(errors.hostPattern)}
          onChange={(event) => onChange({ hostPattern: event.target.value })}
        />
        {errors.hostPattern && <FieldError>{errors.hostPattern}</FieldError>}
      </div>
      <Switch
        layout="row"
        label="Enabled"
        description="When off, the proxy stops brokering this service's traffic."
        checked={form.isEnabled}
        onCheckedChange={(isEnabled) => onChange({ isEnabled })}
      />
    </>
  );
}

type CreateSecretHandler = (query: string, apply: (secretKey: string) => void) => void;

export function HeaderFields({
  form,
  errors,
  sourceOptions,
  onChange,
  onCreateSecret
}: {
  form: TProxiedServiceForm;
  errors: ProxyErrors;
  sourceOptions: SourceOption[];
  onChange: (value: Partial<TProxiedServiceForm>) => void;
  onCreateSecret: CreateSecretHandler;
}) {
  const basicAuth = form.basicAuth ?? { username: emptySource(), password: emptySource() };
  const setHeader = (index: number, value: Partial<TProxiedServiceForm["headers"][number]>) =>
    onChange({
      headers: form.headers.map((row, i) => (i === index ? { ...row, ...value } : row))
    });
  const setBasic = (which: "username" | "password", value: TCredentialSourceForm) =>
    onChange({ basicAuth: { ...basicAuth, [which]: value } });
  return (
    <Tabs
      value={form.headerMode}
      variant="segmented"
      onValueChange={(value) => onChange({ headerMode: value as HeaderRewritingMode })}
    >
      <div className={styles.tabsHead}>
        <div>
          <p className={styles.label}>Header rewrites</p>
          <SmallText muted>Sets these headers on every request.</SmallText>
        </div>
        <TabsList aria-label="Header rewrite modes" variant="segmented">
          <TabsTrigger value={HeaderRewritingMode.Headers}>Custom headers</TabsTrigger>
          <TabsTrigger value={HeaderRewritingMode.BasicAuth}>Basic auth</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={HeaderRewritingMode.Headers}>
        <Stack gap={12}>
          <div className={styles.panel}>
            {form.headers.length === 0 && (
              <SmallText muted className={styles.emptyNote}>
                No headers added. Click below to add.
              </SmallText>
            )}
            {form.headers.map((row, index) => {
              const nameError = errors[`headers.${index}.headerName`];
              const sourceError =
                errors[`headers.${index}.secretKey`] ??
                errors[`headers.${index}.dynamicSecretField`];
              return (
                // eslint-disable-next-line react/no-array-index-key
                <div key={index} className={styles.headerRow}>
                  <div className={styles.grow}>
                    {index === 0 && <span className={styles.miniLabel}>Name</span>}
                    <Input
                      aria-label={`Header ${index + 1} name`}
                      value={row.headerName}
                      placeholder="Authorization"
                      invalid={Boolean(nameError)}
                      onChange={(event) => setHeader(index, { headerName: event.target.value })}
                    />
                    {nameError && <FieldError>{nameError}</FieldError>}
                  </div>
                  <div className={styles.prefixCell}>
                    {index === 0 && <span className={styles.miniLabel}>Prefix</span>}
                    <Input
                      aria-label={`Header ${index + 1} prefix`}
                      value={row.headerPrefix ?? ""}
                      placeholder="Bearer"
                      onChange={(event) => setHeader(index, { headerPrefix: event.target.value })}
                    />
                  </div>
                  <div className={styles.grow}>
                    {index === 0 && <span className={styles.miniLabel}>Value</span>}
                    <CredentialSource
                      label={`Header ${index + 1} value`}
                      value={row}
                      options={sourceOptions}
                      invalid={Boolean(sourceError)}
                      onChange={(source) => setHeader(index, source)}
                      onCreateSecret={(query) =>
                        onCreateSecret(query, (secretKey) =>
                          setHeader(index, { ...emptySource(), secretKey })
                        )
                      }
                    />
                    {sourceError && <FieldError>{sourceError}</FieldError>}
                  </div>
                  <span className={styles.rowAction} data-first={index === 0 || undefined}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      icon="trash"
                      iconOnly
                      onClick={() =>
                        onChange({ headers: form.headers.filter((_, i) => i !== index) })
                      }
                    >
                      Remove header
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              icon="plus"
              onClick={() =>
                onChange({
                  headers: [...form.headers, { ...emptySource(), headerName: "", headerPrefix: "" }]
                })
              }
            >
              Add header
            </Button>
          </div>
        </Stack>
      </TabsContent>
      <TabsContent value={HeaderRewritingMode.BasicAuth}>
        <div className={styles.panel} data-row="">
          {(["username", "password"] as const).map((which) => {
            const error =
              errors[`basicAuth.${which}.secretKey`] ??
              errors[`basicAuth.${which}.dynamicSecretField`];
            const label = which === "username" ? "Username" : "Password";
            return (
              <Field
                key={which}
                className={styles.grow}
                label={label}
                optional={which === "password"}
                error={error}
              >
                <CredentialSource
                  label={label}
                  value={basicAuth[which]}
                  options={sourceOptions}
                  invalid={Boolean(error)}
                  onChange={(source) => setBasic(which, source)}
                  onCreateSecret={(query) =>
                    onCreateSecret(query, (secretKey) =>
                      setBasic(which, { ...emptySource(), secretKey })
                    )
                  }
                />
              </Field>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
}

export function SubstitutionFields({
  form,
  errors,
  sourceOptions,
  showCredentialError,
  onChange,
  onClearCredentialError,
  onCreateSecret
}: {
  form: TProxiedServiceForm;
  errors: ProxyErrors;
  sourceOptions: SourceOption[];
  showCredentialError: boolean;
  onChange: (value: Partial<TProxiedServiceForm>) => void;
  onClearCredentialError: () => void;
  onCreateSecret: CreateSecretHandler;
}) {
  const setRow = (index: number, value: Partial<TProxiedServiceForm["substitutions"][number]>) =>
    onChange({
      substitutions: form.substitutions.map((row, i) => (i === index ? { ...row, ...value } : row))
    });
  return (
    <Stack gap={12}>
      {showCredentialError && (
        <Alert tone="bad" title="Add at least one credential">
          A proxied service needs at least one header rewrite or substitution. Add a substitution
          below, or go back to Header Rewrites.
        </Alert>
      )}
      {form.substitutions.length === 0 && (
        <div className={styles.panel}>
          <SmallText muted className={styles.emptyNote}>
            No substitutions added. Click below to add.
          </SmallText>
        </div>
      )}
      {form.substitutions.map((row, index) => {
        const keyError = errors[`substitutions.${index}.placeholderKey`];
        const valueError = errors[`substitutions.${index}.placeholderValue`];
        const surfaceError = errors[`substitutions.${index}.surfaces`];
        const sourceError =
          errors[`substitutions.${index}.secretKey`] ??
          errors[`substitutions.${index}.dynamicSecretField`];
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={index} className={styles.panel}>
            <div className={styles.sentence}>
              <span className={styles.muted}>Set</span>
              <span className={styles.envVar}>
                <Input
                  mono
                  aria-label={`Substitution ${index + 1} environment variable`}
                  value={row.placeholderKey}
                  placeholder="ENV_VAR_NAME"
                  invalid={Boolean(keyError)}
                  onChange={(event) => setRow(index, { placeholderKey: event.target.value })}
                />
              </span>
              <Tooltip content="Infisical sets this environment variable on the agent for you, holding the placeholder value.">
                <span className={styles.hint}>
                  <Icon name="info" size={14} label="About the environment variable" />
                </span>
              </Tooltip>
              <span className={styles.muted}>to the placeholder</span>
              <span className={styles.grow}>
                <Input
                  mono
                  aria-label={`Substitution ${index + 1} placeholder`}
                  value={row.placeholderValue}
                  placeholder="placeholder_value"
                  invalid={Boolean(valueError)}
                  onChange={(event) => setRow(index, { placeholderValue: event.target.value })}
                />
              </span>
              <Tooltip content="The value the agent sends instead of the real secret; the proxy swaps it on the wire. Prefilled to look like a real credential so format-checking clients accept it. Edit it if your client expects a different shape.">
                <span className={styles.hint}>
                  <Icon name="info" size={14} label="About the placeholder" />
                </span>
              </Tooltip>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                icon="trash"
                iconOnly
                onClick={() =>
                  onChange({ substitutions: form.substitutions.filter((_, i) => i !== index) })
                }
              >
                Remove substitution
              </Button>
            </div>
            {(keyError || valueError) && (
              <FieldError errors={[{ message: keyError }, { message: valueError }]} />
            )}
            <div className={styles.sentence}>
              <span className={styles.muted}>and replace it in</span>
              <div className={styles.grow}>
                <MultiSelect
                  label={`Substitution ${index + 1} surfaces`}
                  options={SURFACE_OPTIONS}
                  value={row.surfaces}
                  placeholder="Select surfaces"
                  invalid={Boolean(surfaceError)}
                  onChange={(value) =>
                    setRow(index, { surfaces: value as ProxiedServiceSubstitutionSurface[] })
                  }
                />
                {surfaceError && <FieldError>{surfaceError}</FieldError>}
              </div>
            </div>
            <div className={styles.sentence}>
              <span className={styles.muted}>with value of</span>
              <div className={styles.grow}>
                <CredentialSource
                  label={`Substitution ${index + 1} value`}
                  value={row}
                  options={sourceOptions}
                  invalid={Boolean(sourceError)}
                  onChange={(source) => setRow(index, source)}
                  onCreateSecret={(query) =>
                    onCreateSecret(query || row.placeholderKey, (secretKey) =>
                      setRow(index, { ...emptySource(), secretKey })
                    )
                  }
                />
                {sourceError && <FieldError>{sourceError}</FieldError>}
              </div>
            </div>
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          icon="plus"
          onClick={() => {
            onChange({
              substitutions: [
                ...form.substitutions,
                {
                  ...emptySource(),
                  placeholderKey: "",
                  placeholderValue: genPlaceholder(),
                  surfaces: []
                }
              ]
            });
            onClearCredentialError();
          }}
        >
          Add substitution
        </Button>
      </div>
    </Stack>
  );
}

const sourceText = (source?: TCredentialSourceForm) => {
  if (source?.dynamicSecretName)
    return source.dynamicSecretField
      ? `${source.dynamicSecretName} → ${source.dynamicSecretField}`
      : source.dynamicSecretName;
  return source?.secretKey || undefined;
};
const hasSource = (source?: TCredentialSourceForm) =>
  Boolean(source?.secretKey || source?.dynamicSecretName);

function Detail({
  label,
  value,
  mono
}: {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className={styles.detail}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue} data-mono={mono || undefined}>
        {value ?? <span className={styles.none}>None</span>}
      </span>
    </div>
  );
}

export function ReviewFields({ form }: { form: TProxiedServiceForm }) {
  const activeHeaders = form.headers.filter((row) => row.headerName && hasSource(row));
  return (
    <Stack gap={32}>
      <section className={styles.reviewGroup}>
        <p className={styles.reviewHead}>Details</p>
        <div className={styles.details}>
          <Detail label="Name" value={form.name} />
          <Detail label="Host pattern" value={form.hostPattern} mono />
          <Detail
            label="Status"
            value={
              <Badge tone={form.isEnabled ? "ok" : "outline"}>
                {form.isEnabled ? "Enabled" : "Disabled"}
              </Badge>
            }
          />
        </div>
      </section>
      <section className={styles.reviewGroup}>
        <p className={styles.reviewHead}>Header rewrites</p>
        {form.headerMode === HeaderRewritingMode.BasicAuth ? (
          <div className={styles.details}>
            <Detail label="Type" value="Basic Auth" />
            <Detail label="Username" value={sourceText(form.basicAuth?.username)} mono />
            <Detail label="Password" value={sourceText(form.basicAuth?.password)} mono />
          </div>
        ) : (
          <Stack gap={12}>
            {activeHeaders.length === 0 && <span className={styles.none}>None</span>}
            {activeHeaders.map((row) => (
              <div key={`${row.headerName}-${encodeSource(row)}`} className={styles.details}>
                <Detail
                  label="Header"
                  value={
                    row.headerPrefix ? `${row.headerName}: ${row.headerPrefix} …` : row.headerName
                  }
                  mono
                />
                <Detail label="Value" value={sourceText(row)} mono />
              </div>
            ))}
          </Stack>
        )}
      </section>
      <section className={styles.reviewGroup}>
        <p className={styles.reviewHead}>Substitutions</p>
        <Stack gap={12}>
          {form.substitutions.length === 0 && <span className={styles.none}>None</span>}
          {form.substitutions.map((row) => (
            <div key={`${row.placeholderKey}-${encodeSource(row)}`} className={styles.details}>
              <Detail label="Env var" value={row.placeholderKey} mono />
              <Detail
                label="Replace in"
                value={row.surfaces.length ? row.surfaces.map(capitalize).join(", ") : undefined}
              />
              <Detail label="Value" value={sourceText(row)} mono />
            </div>
          ))}
        </Stack>
      </section>
    </Stack>
  );
}

const truncate = (value: string, max = 16) =>
  value.length > max ? `${value.slice(0, max)}…` : value;

export function SubstitutionDiagram({
  form,
  template
}: {
  form: TProxiedServiceForm;
  template?: ProxiedServiceTemplate;
}) {
  const example = form.substitutions.find((row) => row.placeholderKey) ?? form.substitutions[0];
  const envVar = example?.placeholderKey || "API_KEY";
  const placeholder = truncate(example?.placeholderValue || "sk-xxxxxxxxxxxx");
  const connector = (label: string) => (
    <div className={styles.connector}>
      <Icon icon={ArrowDownIcon} size={12} />
      <span>{label}</span>
    </div>
  );
  return (
    <div className={styles.diagram}>
      <div className={styles.labelRow}>
        <span className={styles.diagramTitle}>On the wire</span>
        <Tooltip content="When an agent launches with infisical secrets agent-proxy connect, Infisical sets each placeholder as an environment variable on it. The agent sends the placeholder in its requests, and the proxy swaps it for the real secret on the wire.">
          <span className={styles.hint}>
            <Icon name="info" size={12} label="About the agent proxy" />
          </span>
        </Tooltip>
      </div>
      <div className={styles.node}>
        <span className={styles.nodeTitle}>
          <Icon icon={BotIcon} size={14} />
          Your Agent
        </span>
        <code className={styles.nodeCode}>{`${envVar}=${placeholder}`}</code>
        <span className={styles.nodeNote}>
          Infisical sets this env var to a fake, real-looking value.
        </span>
      </div>
      {connector("Agent sends the placeholder in its request")}
      <div className={styles.node} data-accent="">
        <span className={styles.nodeTitle}>
          <Icon icon={ChevronsLeftRightEllipsisIcon} size={14} />
          Agent Proxy
        </span>
        <span className={styles.nodeCode}>
          <s>{placeholder}</s>
          <Icon icon={ArrowRightIcon} size={12} />
          real secret
        </span>
        <span className={styles.nodeNote}>Swaps the placeholder for the real secret.</span>
      </div>
      {connector("Forwards the real request")}
      <div className={styles.node}>
        <span className={styles.nodeTitle}>
          {template ? (
            <ProviderLogo image={template.image} size={14} />
          ) : (
            <Icon name="globe" size={14} />
          )}
          {template?.name || "External Service"}
        </span>
        <span className={styles.nodeNote}>
          Receives the real credential. Your agent never held it.
        </span>
      </div>
    </div>
  );
}
