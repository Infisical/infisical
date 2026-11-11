import { useEffect, useId, useState } from "react";
import {
  type Control,
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CodeIcon } from "lucide-react";

import { Alert } from "@app/components/v4/ui/alert";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { SecretInput } from "@app/components/v4/ui/secret-input";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetSections,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import {
  LogProvider,
  REDACTED_CREDENTIAL_VALUE,
  StreamMode
} from "@app/hooks/api/auditLogStreams/enums";
import type {
  TAuditLogStream,
  TCreateAuditLogStreamDTO
} from "@app/hooks/api/auditLogStreams/types";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import {
  DATADOG_ENDPOINTS,
  type FormProvider as StreamProvider,
  hasStreamMode,
  PRODUCT_LABELS,
  PRODUCTS,
  type StreamFormValues,
  streamFormSchema,
  toFormValues
} from "./stream-model";

const PROVIDERS_DOCS =
  "https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams#example-providers";

export const providerName = (provider: LogProvider) => AUDIT_LOG_STREAM_PROVIDER_MAP[provider].name;

export const ProviderMedia = ({
  provider,
  size = "md"
}: {
  provider: LogProvider;
  size?: "sm" | "md" | "lg";
}) => {
  const { image } = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];
  if (image) return <ProviderIcon icon={image} alt="" size={size} />;
  return <Icon icon={CodeIcon} size={size === "sm" ? 14 : 16} aria-hidden />;
};

type TextFieldProps = { name: string; label: string; placeholder?: string; help?: string };

const TextField = ({ name, label, placeholder, help }: TextFieldProps) => {
  const { control } = useFormContext<StreamFormValues>();
  return (
    <Controller
      name={`credentials.${name}`}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <Field wide label={label} help={help} error={error?.message}>
          <Input
            name={field.name}
            ref={field.ref}
            value={String(field.value ?? "")}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={placeholder}
            autoComplete="off"
            invalid={Boolean(error)}
          />
        </Field>
      )}
    />
  );
};

const keepSaved = (stored: unknown, value: string, onChange: (value: string) => void) => ({
  onFocus: () => {
    if (stored === REDACTED_CREDENTIAL_VALUE && value === REDACTED_CREDENTIAL_VALUE) onChange("");
  },
  onBlur: () => {
    if (stored === REDACTED_CREDENTIAL_VALUE && value === "") onChange(REDACTED_CREDENTIAL_VALUE);
  }
});

const SecretField = ({ name, label, help }: TextFieldProps) => {
  const {
    control,
    formState: { defaultValues }
  } = useFormContext<StreamFormValues>();
  return (
    <Controller
      name={`credentials.${name}`}
      control={control}
      render={({ field, fieldState: { error } }) => {
        const value = String(field.value ?? "");
        return (
          <Field wide label={label} help={help} error={error?.message}>
            <SecretInput
              value={value}
              onChange={field.onChange}
              invalid={Boolean(error)}
              {...keepSaved(defaultValues?.credentials?.[name], value, field.onChange)}
            />
          </Field>
        );
      }}
    />
  );
};

type HeaderForm = { credentials: { headers: { key: string; value: string }[] } };

const HeadersField = () => {
  const {
    control,
    formState: { defaultValues, errors }
  } = useFormContext<StreamFormValues>();
  const headerControl = control as unknown as Control<HeaderForm>;
  const { fields, append, remove } = useFieldArray({
    control: headerControl,
    name: "credentials.headers"
  });
  const savedHeaders = (defaultValues?.credentials?.headers ?? []) as { value?: string }[];
  const headerErrors = (errors.credentials as { headers?: { key?: unknown; value?: unknown }[] })
    ?.headers;
  return (
    <Field
      wide
      label="Headers"
      optional
      group
      error={headerErrors?.some(Boolean) ? "Enter a name and value for every header" : undefined}
    >
      <Stack gap={8}>
        {fields.map((header, index) => (
          <Inline key={header.id} gap={8} align="start" wrap={false}>
            <Controller
              name={`credentials.headers.${index}.key`}
              control={headerControl}
              render={({ field, fieldState: { error } }) => (
                <Input
                  {...field}
                  style={{ flex: "1 1 0", minWidth: 0 }}
                  aria-label={`Header ${index + 1} name`}
                  placeholder="Authorization"
                  autoComplete="off"
                  invalid={Boolean(error)}
                />
              )}
            />
            <Inline gap={8} align="center" wrap={false} style={{ flex: "2 1 0", minWidth: 0 }}>
              <Controller
                name={`credentials.headers.${index}.value`}
                control={headerControl}
                render={({ field, fieldState: { error } }) => (
                  <SecretInput
                    aria-label={`Header ${index + 1} value`}
                    placeholder="Bearer <token>"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={Boolean(error)}
                    style={{ flex: 1, minWidth: 0 }}
                    {...keepSaved(savedHeaders[index]?.value, field.value, field.onChange)}
                  />
                )}
              />
              <Button
                variant="ghost"
                size="icon"
                icon="trash"
                aria-label={`Remove header ${index + 1}`}
                onClick={() => remove(index)}
              />
            </Inline>
          </Inline>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            icon="plus"
            onClick={() => append({ key: "", value: "" })}
          >
            Add header
          </Button>
        </div>
      </Stack>
    </Field>
  );
};

const RegionField = () => {
  const { control } = useFormContext<StreamFormValues>();
  return (
    <Controller
      name="credentials.url"
      control={control}
      render={({ field, fieldState: { error } }) => (
        <Field wide label="Region" description={String(field.value ?? "")} error={error?.message}>
          <Select
            label="Region"
            options={DATADOG_ENDPOINTS}
            value={String(field.value ?? "")}
            onChange={field.onChange}
            placeholder="Select a region"
            invalid={Boolean(error)}
          />
        </Field>
      )}
    />
  );
};

const CredentialFields = ({ provider }: { provider: StreamProvider }) => {
  switch (provider) {
    case LogProvider.Azure:
      return (
        <>
          <TextField
            name="tenantId"
            label="Tenant ID"
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          <TextField
            name="clientId"
            label="Client ID"
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          <SecretField name="clientSecret" label="Client secret" />
          <TextField
            name="dceUrl"
            label="Data collection endpoint URL"
            placeholder="https://example.eastus-1.ingest.monitor.azure.com"
          />
          <TextField
            name="dcrId"
            label="Data collection rule immutable ID"
            placeholder="dcr-00000000000000000000000000000000"
          />
          <TextField name="cltName" label="Custom log table name" placeholder="InfisicalLogs" />
        </>
      );
    case LogProvider.Cribl:
      return (
        <>
          <TextField
            name="url"
            label="Stream URL"
            placeholder="http://default.main.example.cribl.cloud:20000/infisical/_bulk"
            help="Combine your Cribl hostname (such as cribl.example.com), the Infisical HTTP data source port (such as 20000) and the HTTP event API path (such as /infisical). Use https if the data source has TLS enabled."
          />
          <SecretField name="token" label="Stream token" />
        </>
      );
    case LogProvider.Custom:
      return (
        <>
          <TextField name="url" label="Endpoint URL" placeholder="https://example.com" />
          <HeadersField />
        </>
      );
    case LogProvider.Datadog:
      return (
        <>
          <RegionField />
          <SecretField name="token" label="API key" />
        </>
      );
    case LogProvider.Splunk:
      return (
        <>
          <Inline gap={12} align="start" wrap={false}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField name="hostname" label="Hostname" placeholder="splunk.example.com" />
            </div>
            <div style={{ width: "7rem" }}>
              <TextField name="port" label="Port" />
            </div>
          </Inline>
          <SecretField name="token" label="HEC token" />
        </>
      );
    case LogProvider.SumoLogic:
      return (
        <>
          <TextField
            name="url"
            label="HTTP source address"
            placeholder="https://endpoint.collection.sumologic.com/receiver/v1/http"
            help="The HTTP Source Address from your Sumo Logic HTTP Logs and Metrics source."
          />
          <SecretField
            name="token"
            label="Auth token"
            help="The collector token from your HTTP source's x-sumo-token header. Infisical sends it in that header on each request."
          />
        </>
      );
    default:
      return null;
  }
};

const StreamModeField = ({
  provider,
  savedMode
}: {
  provider: LogProvider;
  savedMode: StreamMode;
}) => {
  const { control } = useFormContext<StreamFormValues>();
  const isSingle = savedMode === StreamMode.Single;
  const format =
    provider === LogProvider.Cribl ? "a newline-delimited JSON (NDJSON) batch" : "a JSON array";
  return (
    <Controller
      name="streamMode"
      control={control}
      render={({ field }) => {
        const isBatch = field.value === StreamMode.Batch;
        return (
          <Stack gap={8}>
            <Switch
              layout="row"
              label="Batch delivery"
              description={
                isSingle && !isBatch
                  ? `This stream sends one event per request. Turn on batch delivery to send events as ${format}.`
                  : `Send events as ${format}.`
              }
              checked={isBatch}
              disabledReason={isSingle ? undefined : "Batch delivery can't be turned off"}
              onChange={(checked) => field.onChange(checked ? StreamMode.Batch : StreamMode.Single)}
            />
            {isSingle && isBatch && (
              <Alert tone="warn">
                {`You can't switch back to single delivery. Make sure your ${
                  provider === LogProvider.Cribl ? "Cribl source" : "endpoint"
                } accepts ${format}.`}
              </Alert>
            )}
          </Stack>
        );
      }}
    />
  );
};

const ProductsField = () => {
  const { control } = useFormContext<StreamFormValues>();
  return (
    <Controller
      name="products"
      control={control}
      render={({ field }) => (
        <Field
          wide
          label="Products"
          optional
          help="Only stream audit logs for these products. Leave empty to stream every product. Organization covers org-level events such as SSO, members and settings."
        >
          <MultiSelect
            label="Products"
            placeholder="All products"
            options={PRODUCTS.map((product) => ({
              value: product,
              label: PRODUCT_LABELS[product]
            }))}
            value={field.value}
            onChange={(next) =>
              field.onChange(next.length === PRODUCTS.length ? [] : (next as typeof field.value))
            }
          />
        </Field>
      )}
    />
  );
};

const StreamForm = ({
  provider,
  stream,
  onBack,
  onCancel,
  onDone,
  onDirtyChange,
  onPendingChange
}: {
  provider: StreamProvider;
  stream?: TAuditLogStream;
  onBack?: () => void;
  onCancel: () => void;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}) => {
  const adapter = useV4Adapter("auditLogs");
  const create = adapter.useCreateStream();
  const update = adapter.useUpdateStream();
  const name = providerName(provider);
  const formId = useId();
  const form = useForm<StreamFormValues>({
    resolver: zodResolver(streamFormSchema(provider)),
    defaultValues: toFormValues(provider, stream)
  });
  const {
    handleSubmit,
    formState: { isDirty, isSubmitting }
  } = form;

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(() => onPendingChange(isSubmitting), [isSubmitting, onPendingChange]);

  const submit = async (values: StreamFormValues) => {
    const credentials = values.credentials as TCreateAuditLogStreamDTO["credentials"];
    const filters = values.products.length ? { products: values.products } : null;
    try {
      if (stream)
        await update.mutateAsync({
          auditLogStreamId: stream.id,
          provider,
          credentials,
          filters,
          ...(hasStreamMode(provider) ? { streamMode: values.streamMode } : {})
        });
      else await create.mutateAsync({ provider, credentials, filters });
    } catch (error) {
      failed(`Failed to ${stream ? "update" : "create"} the ${name} log stream`, error);
      return;
    }
    saved(stream ? `${name} log stream updated` : `${name} log stream created`);
    onDone();
  };

  return (
    <SheetSections
      header={
        <SheetHeader>
          <SheetTitle>
            <Inline gap={8} align="center" wrap={false}>
              <ProviderMedia provider={provider} size="lg" />
              {stream ? `Edit ${name} log stream` : `Add ${name} log stream`}
              <DocumentationLinkBadge href={PROVIDERS_DOCS} />
            </Inline>
          </SheetTitle>
        </SheetHeader>
      }
      footer={
        <SheetFooter>
          <Inline gap={8} justify="between">
            {onBack ? (
              <Button variant="ghost" icon="chev-left" onClick={onBack} disabled={isSubmitting}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <Inline gap={8}>
              <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                loading={isSubmitting}
                disabledReason={stream && !isDirty ? "No changes to save" : undefined}
              >
                {stream ? "Save" : "Create log stream"}
              </Button>
            </Inline>
          </Inline>
        </SheetFooter>
      }
    >
      <SheetBody>
        <FormProvider {...form}>
          <form id={formId} noValidate onSubmit={handleSubmit(submit)}>
            <Stack gap={16}>
              <CredentialFields provider={provider} />
              {stream && hasStreamMode(provider) && (
                <StreamModeField
                  provider={provider}
                  savedMode={stream.streamMode ?? StreamMode.Batch}
                />
              )}
              <ProductsField />
            </Stack>
          </form>
        </FormProvider>
      </SheetBody>
    </SheetSections>
  );
};

const ProviderPicker = ({
  onSelect,
  onPlanned
}: {
  onSelect: (provider: StreamProvider) => void;
  onPlanned: () => void;
}) => {
  const { data: options, isPending } = useV4Adapter("auditLogs").useStreamOptions();
  const providers = [...(options ?? []).map((option) => option.provider), LogProvider.QRadar].sort(
    (a, b) => Number(a === LogProvider.Custom) - Number(b === LogProvider.Custom)
  );
  return (
    <SheetSections
      header={
        <SheetHeader>
          <SheetTitle>Add log stream</SheetTitle>
        </SheetHeader>
      }
    >
      <SheetBody>
        {isPending ? (
          <Loader label="Loading providers" />
        ) : (
          <List label="Log providers" size="sm">
            {providers.map((provider) => (
              <ListRow
                key={provider}
                value={provider}
                label={providerName(provider)}
                title={providerName(provider)}
                media={<ProviderMedia provider={provider} />}
                badge={
                  provider === LogProvider.QRadar ? (
                    <Badge tone="soft">Enterprise</Badge>
                  ) : undefined
                }
                onClick={() =>
                  provider === LogProvider.QRadar
                    ? onPlanned()
                    : onSelect(provider as StreamProvider)
                }
              />
            ))}
          </List>
        )}
      </SheetBody>
    </SheetSections>
  );
};

export type StreamSheetState = { mode: "create" } | { mode: "edit"; stream: TAuditLogStream };

export const StreamSheet = ({
  state,
  onClose,
  onPlanned
}: {
  state?: StreamSheetState;
  onClose: () => void;
  onPlanned: () => void;
}) => {
  const [picked, setPicked] = useState<StreamProvider>();
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const stream = state?.mode === "edit" ? state.stream : undefined;
  const provider = (stream?.provider ?? picked) as StreamProvider | undefined;

  useEffect(() => {
    if (state) return;
    setPicked(undefined);
    setDirty(false);
  }, [state]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardTo, setDiscardTo] = useState<"close" | "back">("close");
  const request = (to: "close" | "back") => {
    if (!dirty) {
      if (to === "back") setPicked(undefined);
      else onClose();
      return;
    }
    setDiscardTo(to);
    setConfirmOpen(true);
  };

  return (
    <>
      <Sheet open={Boolean(state)} onOpenChange={(open) => !open && request("close")}>
        <SheetContent size="md" pending={pending}>
          {provider ? (
            <StreamForm
              key={`${provider}-${stream?.id ?? "new"}`}
              provider={provider}
              stream={stream}
              onBack={stream ? undefined : () => request("back")}
              onCancel={() => request("close")}
              onDone={onClose}
              onDirtyChange={setDirty}
              onPendingChange={setPending}
            />
          ) : (
            <ProviderPicker onSelect={setPicked} onPlanned={onPlanned} />
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onDiscard={() => {
          setConfirmOpen(false);
          setDirty(false);
          if (discardTo === "back") setPicked(undefined);
          else onClose();
        }}
        description="Your changes to this log stream will be lost."
      />
    </>
  );
};
