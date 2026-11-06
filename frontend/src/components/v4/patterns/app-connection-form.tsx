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

export type AppConnectionMethodPreset = {
  value: string;
  label: string;
  description?: string;
  credentials: Record<string, unknown>;
  fields: readonly AppConnectionFieldPreset[];
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

export type AppConnectionFormProps = {
  id: string;
  preset: AppConnectionPreset;
  defaultName?: string;
  onSubmit: (values: AppConnectionFormValues) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
};

export function AppConnectionForm({
  id,
  preset,
  defaultName = "",
  onSubmit,
  onDirtyChange,
  onPendingChange
}: AppConnectionFormProps) {
  const [first] = preset.methods;
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
  const method = preset.methods.find((entry) => entry.value === values.method) ?? first;
  const [failure, setFailure] = React.useState("");
  React.useEffect(() => onDirtyChange?.(formState.isDirty), [formState.isDirty, onDirtyChange]);
  React.useEffect(
    () => onPendingChange?.(formState.isSubmitting),
    [formState.isSubmitting, onPendingChange]
  );
  const submit = form.handleSubmit(async (submitted) => {
    setFailure("");
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
      <FieldSet disabled={formState.isSubmitting}>
        {renderField({
          name: "name",
          label: "Name",
          mono: true,
          placeholder: `my-${preset.app}-connection`,
          description: "Lowercase letters, numbers and dashes."
        })}
        {preset.methods.length > 1 && (
          <Controller
            control={control}
            name="method"
            render={({ field }) => (
              <Field label="Method" description={method.description}>
                <Select
                  label="Method"
                  options={preset.methods.map((entry) => ({
                    value: entry.value,
                    label: entry.label
                  }))}
                  value={field.value}
                  onValueChange={(next) => {
                    field.onChange(next);
                    const chosen = preset.methods.find((entry) => entry.value === next);
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
  create
}: {
  preset: AppConnectionPreset | undefined;
  disabledReason?: string;
  create: (values: AppConnectionFormValues) => Promise<{ id: string; name: string }>;
}): ComboboxCreation | undefined {
  if (!preset) return undefined;
  return {
    mode: "dialog",
    label: "Create connection",
    title: `Create ${preset.name} connection`,
    description: "The new connection is selected once it is created.",
    submitLabel: "Create connection",
    disabledReason,
    discardTitle: "Discard connection setup?",
    discardDescription: "Your progress configuring this connection will be lost.",
    renderForm: ({ query, formId, complete, onDirtyChange, onPendingChange }) => (
      <AppConnectionForm
        id={formId}
        preset={preset}
        defaultName={query}
        onDirtyChange={onDirtyChange}
        onPendingChange={onPendingChange}
        onSubmit={async (values) => {
          const connection = await create(values);
          complete({ value: connection.id, label: connection.name });
        }}
      />
    )
  };
}
