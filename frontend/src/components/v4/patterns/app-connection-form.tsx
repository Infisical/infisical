import * as React from "react";
import { Controller, type FieldValues, get, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

import { Alert, AlertDescription } from "../ui/alert";
import type { ComboboxCreation } from "../ui/combobox";
import { Field, FieldSet } from "../ui/field";
import { Input } from "../ui/input";
import { SecretInput } from "../ui/secret-input";
import { Select, type SelectOption } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";

export type AppConnectionFieldPreset = {
  /** Dotted path into the form values, for example credentials.accessKeyId. */
  name: string;
  label: string;
  kind?: "text" | "secret" | "number" | "textarea" | "switch" | "select";
  placeholder?: string;
  description?: string;
  optional?: boolean;
  mono?: boolean;
  options?: readonly SelectOption[];
  /** Show the field only while this returns true for the current values. */
  visible?: (values: FieldValues) => boolean;
};

export type AppConnectionRedirectPreset = {
  /** Submit label while this method is the only one, for example Connect to GitHub. */
  submitLabel: string;
  /** Provider URL without the state, or undefined while the server has no app configured. */
  href: (input: { values: FieldValues; option?: Record<string, unknown> }) => string | undefined;
  /** Shown instead of redirecting while href is undefined. */
  unconfigured: string;
  /** Builds the create credentials from the provider's callback parameters and the stored ones. */
  credentials: (input: {
    callback: Record<string, string | undefined>;
    stored: Record<string, unknown>;
  }) => Record<string, unknown>;
};

export type AppConnectionMethodPreset = {
  value: string;
  label: string;
  description?: string;
  credentials: Record<string, unknown>;
  fields: readonly AppConnectionFieldPreset[];
  /** The method sends the person to the provider instead of taking credentials. */
  redirect?: AppConnectionRedirectPreset;
};

export type AppConnectionPreset = {
  app: string;
  /** Display name of the app, for example AWS. */
  name: string;
  methods: readonly AppConnectionMethodPreset[];
  /** The app's create schema from the shared data layer; the form never validates on its own. */
  schema: ZodType;
  /** Extra root values the schema expects, for example gatewayId: null. */
  values?: Record<string, unknown>;
};

export type AppConnectionFormValues = FieldValues & { app: string; method: string; name: string };

export type AppConnectionRedirect = {
  /** The calling flow's v4 href. The callback returns here with connectionId and connectionName. */
  returnTo: string;
  projectId?: string;
  /** The app's connection option from the server, for example the GitHub App slug. */
  option?: Record<string, unknown>;
  /** Stores the pending record with a fresh state and sends the person to href. */
  start: (href: string, pending: Omit<PendingConnectionRedirect, "state">) => void;
};

export type PendingConnectionRedirect = {
  state: string;
  app: string;
  method: string;
  name: string;
  description?: string | null;
  credentials: Record<string, unknown>;
  projectId?: string;
  returnTo: string;
};

const usableMethods = (preset: AppConnectionPreset, redirect?: AppConnectionRedirect) =>
  redirect ? preset.methods : preset.methods.filter((entry) => !entry.redirect);

export type AppConnectionFormProps = {
  id: string;
  preset: AppConnectionPreset;
  defaultName?: string;
  /** Needed for redirect methods, which are left out without it. */
  redirect?: AppConnectionRedirect;
  onSubmit: (values: AppConnectionFormValues) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  /** Called with the selected method's submit label: its redirect submitLabel, or Create connection. */
  onSubmitLabelChange?: (label: string) => void;
};

export function AppConnectionForm({
  id,
  preset,
  defaultName = "",
  redirect,
  onSubmit,
  onDirtyChange,
  onPendingChange,
  onSubmitLabelChange
}: AppConnectionFormProps) {
  const methods = usableMethods(preset, redirect);
  const [first] = methods;
  const form = useForm<FieldValues>({
    resolver: zodResolver(preset.schema),
    defaultValues: {
      ...preset.values,
      app: preset.app,
      name: defaultName,
      description: "",
      method: first.value,
      credentials: first.credentials
    }
  });
  const { control, formState } = form;
  const values = useWatch({ control });
  const method = methods.find((entry) => entry.value === values.method) ?? first;
  const redirectHref = method.redirect?.href({ values, option: redirect?.option });
  const [failure, setFailure] = React.useState("");
  const [redirecting, setRedirecting] = React.useState(false);
  const pending = formState.isSubmitting || redirecting;
  React.useEffect(() => onDirtyChange?.(formState.isDirty), [formState.isDirty, onDirtyChange]);
  const submitLabel = method.redirect?.submitLabel ?? "Create connection";
  React.useEffect(() => onSubmitLabelChange?.(submitLabel), [submitLabel, onSubmitLabelChange]);
  React.useEffect(() => onPendingChange?.(pending), [pending, onPendingChange]);
  const submit = form.handleSubmit(async (submitted) => {
    setFailure("");
    if (method.redirect) {
      const href = method.redirect.href({ values: submitted, option: redirect?.option });
      if (!redirect || !href) {
        setFailure(method.redirect.unconfigured);
        return;
      }
      setRedirecting(true);
      redirect.start(href, {
        app: preset.app,
        method: method.value,
        name: submitted.name,
        description: submitted.description,
        credentials: submitted.credentials ?? {},
        projectId: redirect.projectId,
        returnTo: redirect.returnTo
      });
      return;
    }
    try {
      await onSubmit(submitted as AppConnectionFormValues);
    } catch (cause) {
      setFailure(
        cause instanceof Error && cause.message
          ? cause.message
          : `Could not create this ${preset.name} connection. Check the details and try again.`
      );
    }
  });
  const renderField = (spec: AppConnectionFieldPreset) => (
    <Controller
      key={`${method.value}:${spec.name}`}
      control={control}
      name={spec.name}
      render={({ field }) => {
        const error: string | undefined = get(formState.errors, spec.name)?.message;
        if (spec.kind === "switch")
          return (
            <Switch
              ref={field.ref}
              label={spec.label}
              description={spec.description}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          );
        const text = field.value === undefined || field.value === null ? "" : String(field.value);
        let input: React.ReactNode;
        if (spec.kind === "secret")
          input = (
            <SecretInput
              ref={field.ref}
              value={text}
              onChange={field.onChange}
              onBlur={field.onBlur}
              invalid={Boolean(error)}
              placeholder={spec.placeholder}
            />
          );
        else if (spec.kind === "textarea")
          input = (
            <Textarea
              ref={field.ref}
              value={text}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={spec.placeholder}
            />
          );
        else if (spec.kind === "select")
          input = (
            <Select
              label={spec.label}
              options={spec.options ?? []}
              value={text}
              onValueChange={field.onChange}
              invalid={Boolean(error)}
            />
          );
        else
          input = (
            <Input
              ref={field.ref}
              type={spec.kind === "number" ? "number" : "text"}
              mono={spec.mono}
              value={text}
              onChange={field.onChange}
              onBlur={field.onBlur}
              invalid={Boolean(error)}
              placeholder={spec.placeholder}
            />
          );
        return (
          <Field
            label={spec.label}
            description={spec.description}
            optional={spec.optional}
            error={error}
          >
            {input}
          </Field>
        );
      }}
    />
  );
  return (
    <form id={id} noValidate data-slot="app-connection-form" onSubmit={submit}>
      <FieldSet disabled={pending}>
        {renderField({
          name: "name",
          label: "Name",
          placeholder: `my-${preset.app}-connection`,
          description: "Lowercase letters, numbers and dashes."
        })}
        {methods.length > 1 && (
          <Controller
            control={control}
            name="method"
            render={({ field }) => (
              <Field label="Method" description={method.description}>
                <Select
                  label="Method"
                  options={methods.map((entry) => ({
                    value: entry.value,
                    label: entry.label
                  }))}
                  value={field.value}
                  onValueChange={(next) => {
                    field.onChange(next);
                    const chosen = methods.find((entry) => entry.value === next);
                    form.setValue("credentials", chosen?.credentials ?? {}, { shouldDirty: true });
                    form.clearErrors("credentials");
                  }}
                />
              </Field>
            )}
          />
        )}
        {method.fields.filter((spec) => spec.visible?.(values) ?? true).map(renderField)}
        {renderField({
          name: "description",
          label: "Description",
          kind: "textarea",
          optional: true
        })}
        {method.redirect && !redirectHref && !failure && (
          <Alert>
            <AlertDescription>{method.redirect.unconfigured}</AlertDescription>
          </Alert>
        )}
        {failure && (
          <Alert variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        )}
      </FieldSet>
    </form>
  );
}
AppConnectionForm.displayName = "AppConnectionForm";

/**
 * Combobox creation for an app connection picker. It is not a hook: the Combobox owns the dialog,
 * dirty and pending state, so this only describes the dialog and maps the new connection to an option.
 */
export function connectionCreation({
  preset,
  disabledReason,
  redirect,
  create
}: {
  preset: AppConnectionPreset | undefined;
  disabledReason?: string;
  redirect?: AppConnectionRedirect;
  create: (values: AppConnectionFormValues) => Promise<{ id: string; name: string }>;
}): ComboboxCreation | undefined {
  const methods = preset ? usableMethods(preset, redirect) : [];
  if (!preset || !methods.length) return undefined;
  const redirectOnly = methods.every((entry) => entry.redirect);
  return {
    mode: "dialog",
    label: "Create connection",
    title: `Create ${preset.name} connection`,
    description: "The new connection is selected once it is created.",
    submitLabel: (redirectOnly && methods[0].redirect?.submitLabel) || "Create connection",
    disabledReason,
    discardTitle: "Discard connection setup?",
    discardDescription: "Your progress configuring this connection will be lost.",
    renderForm: ({
      query,
      formId,
      complete,
      onDirtyChange,
      onPendingChange,
      onSubmitLabelChange
    }) => (
      <AppConnectionForm
        id={formId}
        preset={preset}
        defaultName={query}
        redirect={redirect}
        onDirtyChange={onDirtyChange}
        onPendingChange={onPendingChange}
        onSubmitLabelChange={onSubmitLabelChange}
        onSubmit={async (values) => {
          const connection = await create(values);
          complete({ value: connection.id, label: connection.name });
        }}
      />
    )
  };
}
