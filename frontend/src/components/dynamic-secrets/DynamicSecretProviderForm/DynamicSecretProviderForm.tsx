import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Controller,
  DefaultValues,
  FormProvider,
  Resolver,
  SubmitHandler,
  useForm
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useCreateDynamicSecret, useUpdateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFormItems } from "./DynamicSecretProviderFormItems";
import {
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretFormEnvironment,
  TDynamicSecretProviderDefinition,
  TDynamicSecretProviderFormItem,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "./types";

type TCreateProps<
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues
> = TCreateDynamicSecretProviderFormContext & {
  mode: "create";
  definition: TDynamicSecretProviderDefinition<TProvider, TCreateValues, TEditValues>;
  onCompleted: (result?: unknown) => void;
  onCancel: () => void;
  onBack?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  header?: ReactNode;
};

type TEditProps<
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues
> = TEditDynamicSecretProviderFormContext & {
  mode: "edit";
  definition: TDynamicSecretProviderDefinition<TProvider, TCreateValues, TEditValues>;
  onCompleted: (result?: unknown) => void;
  onCancel: () => void;
  onBack?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  header?: ReactNode;
};

type Props<
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues
> =
  | TCreateProps<TProvider, TCreateValues, TEditValues>
  | TEditProps<TProvider, TCreateValues, TEditValues>;

const EMPTY_ENVIRONMENTS: TCreateDynamicSecretProviderFormContext["environments"] = [];

export const DynamicSecretProviderForm = <
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues
>(
  props: Props<TProvider, TCreateValues, TEditValues>
) => {
  type TValues = TCreateValues | TEditValues;
  const {
    definition,
    mode,
    onCancel,
    onBack,
    onCompleted,
    onDirtyChange,
    projectSlug,
    secretPath,
    header
  } = props;
  const createDynamicSecret = useCreateDynamicSecret();
  const updateDynamicSecret = useUpdateDynamicSecret();
  const [providerSubmitState, setProviderSubmitState] = useState({
    isDisabled: false,
    isPending: false
  });

  let environments = EMPTY_ENVIRONMENTS;
  let isSingleEnvironmentMode = false;
  let editDynamicSecret: TEditDynamicSecretProviderFormContext["dynamicSecret"] | undefined;
  let editEnvironment: string | undefined;

  if (mode === "create") {
    ({ environments, isSingleEnvironmentMode = false } = props);
  } else {
    const { dynamicSecret, environment } = props;
    editDynamicSecret = dynamicSecret;
    editEnvironment = environment;
  }

  const context = useMemo<
    TCreateDynamicSecretProviderFormContext | TEditDynamicSecretProviderFormContext
  >(
    () =>
      mode === "create"
        ? { projectSlug, secretPath, environments, isSingleEnvironmentMode }
        : {
            projectSlug,
            secretPath,
            dynamicSecret:
              editDynamicSecret as TEditDynamicSecretProviderFormContext["dynamicSecret"],
            environment: editEnvironment as string
          },
    [
      editDynamicSecret,
      editEnvironment,
      environments,
      isSingleEnvironmentMode,
      mode,
      projectSlug,
      secretPath
    ]
  );

  const schema = mode === "create" ? definition.create.schema : definition.edit.schema;
  const defaultValues = useMemo(
    () =>
      mode === "create"
        ? definition.create.getDefaultValues(context as TCreateDynamicSecretProviderFormContext)
        : definition.edit.getDefaultValues(context as TEditDynamicSecretProviderFormContext),
    [context, definition, mode]
  );

  const form = useForm<TValues>({
    resolver: zodResolver(schema) as Resolver<TValues>,
    defaultValues: defaultValues as DefaultValues<TValues>,
    values: mode === "edit" ? (defaultValues as TValues) : undefined,
    shouldFocusError: true
  });
  const [hasDirtyBaseline, setHasDirtyBaseline] = useState(false);

  // Re-baseline after mount-time controlled-input synchronization so prefills
  // never trigger an unsaved-change guard.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      form.reset(form.getValues());
      setHasDirtyBaseline(true);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form]);

  useEffect(() => {
    if (!hasDirtyBaseline) {
      onDirtyChange?.(false);
      return undefined;
    }
    onDirtyChange?.(form.formState.isDirty);
    return () => onDirtyChange?.(false);
  }, [hasDirtyBaseline, form.formState.isDirty, onDirtyChange]);

  const isPending =
    form.formState.isSubmitting ||
    providerSubmitState.isPending ||
    (mode === "create" ? createDynamicSecret.isPending : updateDynamicSecret.isPending);

  const handleSubmit: SubmitHandler<TValues> = async (values) => {
    if (isPending) return;

    if (mode === "create") {
      const payload = definition.create.toPayload(
        values as TCreateValues,
        context as TCreateDynamicSecretProviderFormContext
      );
      const payloads = "provider" in payload ? [payload] : payload;
      const results = await Promise.all(
        payloads.map((item) => createDynamicSecret.mutateAsync(item))
      );
      onCompleted(results.length === 1 ? results[0] : results);
      return;
    }

    const payload = definition.edit.toPayload(
      values as TEditValues,
      context as TEditDynamicSecretProviderFormContext
    );
    const result = await updateDynamicSecret.mutateAsync(payload);
    onCompleted(result);
    createNotification({
      type: "success",
      text: definition.edit.successMessage
    });
  };

  const modeDefinition = mode === "create" ? definition.create : definition.edit;
  const fields = modeDefinition.fields ?? definition.fields;
  const CustomRenderer = (modeDefinition.customRenderer ?? definition.customRenderer)?.Component;
  const { commonFields } = modeDefinition;
  const ttlFieldCount =
    Number(commonFields?.defaultTTL?.isVisible !== false) +
    Number(commonFields?.maxTTL?.isVisible !== false);
  let commonFieldGrid = "@2xl:grid-cols-[minmax(0,1fr)_8rem_8rem]";
  if (ttlFieldCount === 0) commonFieldGrid = "@2xl:grid-cols-1";
  if (ttlFieldCount === 1) commonFieldGrid = "@2xl:grid-cols-[minmax(0,1fr)_8rem]";
  const nameError = form.formState.errors.name;
  const defaultTtlError = form.formState.errors.defaultTTL;
  const maxTtlError = form.formState.errors.maxTTL;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        autoComplete="off"
        noValidate
        data-slot="dynamic-secret-provider-form"
        className="@container flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
          {header}
          <section className="flex flex-col gap-4" aria-label="Dynamic secret details">
            <div className={cn("grid grid-cols-1 gap-3", commonFieldGrid)}>
              {commonFields?.name?.isVisible !== false && (
                <Controller
                  control={form.control}
                  name={"name" as never}
                  render={({ field }) => (
                    <Field data-invalid={Boolean(nameError)}>
                      <FieldLabel htmlFor="dynamic-secret-name">
                        {commonFields?.name?.label ?? "Secret Name"}
                      </FieldLabel>
                      <Input
                        ref={field.ref}
                        id="dynamic-secret-name"
                        name={field.name}
                        value={typeof field.value === "string" ? field.value : ""}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        placeholder="dynamic-secret"
                        isError={Boolean(nameError)}
                        aria-describedby={nameError ? "dynamic-secret-name-error" : undefined}
                        disabled={commonFields?.name?.isDisabled}
                      />
                      {nameError?.message && (
                        <FieldError id="dynamic-secret-name-error">
                          {nameError.message as string}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
              )}
              {commonFields?.defaultTTL?.isVisible !== false && (
                <Controller
                  control={form.control}
                  name={"defaultTTL" as never}
                  render={({ field }) => (
                    <Field data-invalid={Boolean(defaultTtlError)}>
                      <FieldLabel htmlFor="dynamic-secret-default-ttl">
                        {commonFields?.defaultTTL?.label ?? "Default TTL"}
                      </FieldLabel>
                      <Input
                        ref={field.ref}
                        id="dynamic-secret-default-ttl"
                        name={field.name}
                        value={typeof field.value === "string" ? field.value : ""}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        isError={Boolean(defaultTtlError)}
                        aria-describedby={
                          [
                            commonFields?.defaultTTL?.description
                              ? "dynamic-secret-default-ttl-description"
                              : undefined,
                            defaultTtlError ? "dynamic-secret-default-ttl-error" : undefined
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        disabled={commonFields?.defaultTTL?.isDisabled}
                      />
                      {commonFields?.defaultTTL?.description && (
                        <FieldDescription id="dynamic-secret-default-ttl-description">
                          {commonFields.defaultTTL.description}
                        </FieldDescription>
                      )}
                      {defaultTtlError?.message && (
                        <FieldError id="dynamic-secret-default-ttl-error">
                          {defaultTtlError.message as string}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
              )}
              {commonFields?.maxTTL?.isVisible !== false && (
                <Controller
                  control={form.control}
                  name={"maxTTL" as never}
                  render={({ field }) => (
                    <Field data-invalid={Boolean(maxTtlError)}>
                      <FieldLabel htmlFor="dynamic-secret-max-ttl">
                        {commonFields?.maxTTL?.label ?? "Max TTL"}
                      </FieldLabel>
                      <Input
                        ref={field.ref}
                        id="dynamic-secret-max-ttl"
                        name={field.name}
                        value={typeof field.value === "string" ? field.value : ""}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        isError={Boolean(maxTtlError)}
                        aria-describedby={
                          [
                            commonFields?.maxTTL?.description
                              ? "dynamic-secret-max-ttl-description"
                              : undefined,
                            maxTtlError ? "dynamic-secret-max-ttl-error" : undefined
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        disabled={commonFields?.maxTTL?.isDisabled}
                      />
                      {commonFields?.maxTTL?.description && (
                        <FieldDescription id="dynamic-secret-max-ttl-description">
                          {commonFields.maxTTL.description}
                        </FieldDescription>
                      )}
                      {maxTtlError?.message && (
                        <FieldError id="dynamic-secret-max-ttl-error">
                          {maxTtlError.message as string}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
              )}
            </div>
            {mode === "create" &&
              !isSingleEnvironmentMode &&
              commonFields?.environment?.isVisible !== false && (
                <Controller
                  control={form.control}
                  name={"environment" as never}
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)}>
                      <FieldLabel htmlFor="dynamic-secret-environment">
                        {commonFields?.environment?.label ?? "Environment"}
                      </FieldLabel>
                      <FilterableSelect<TDynamicSecretFormEnvironment>
                        inputId="dynamic-secret-environment"
                        options={environments}
                        value={(field.value as TDynamicSecretFormEnvironment | undefined) ?? null}
                        onBlur={field.onBlur}
                        onChange={field.onChange}
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.slug}
                        placeholder="Select the environment to create the secret in..."
                        isDisabled={commonFields?.environment?.isDisabled}
                        isError={Boolean(error)}
                        aria-describedby={
                          [
                            commonFields?.environment?.description
                              ? "dynamic-secret-environment-description"
                              : undefined,
                            error ? "dynamic-secret-environment-error" : undefined
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                      />
                      {commonFields?.environment?.description && (
                        <FieldDescription id="dynamic-secret-environment-description">
                          {commonFields.environment.description}
                        </FieldDescription>
                      )}
                      {error?.message && (
                        <FieldError id="dynamic-secret-environment-error">
                          {error.message}
                        </FieldError>
                      )}
                    </Field>
                  )}
                />
              )}
          </section>

          <section
            className="flex flex-col gap-4"
            aria-labelledby={
              commonFields?.configurationHeading !== false
                ? "dynamic-secret-configuration-heading"
                : undefined
            }
          >
            {commonFields?.configurationHeading !== false && (
              <h3 id="dynamic-secret-configuration-heading" className="text-base font-medium">
                {commonFields?.configurationHeading ?? "Configuration"}
              </h3>
            )}
            {fields && (
              <DynamicSecretProviderFormItems
                items={fields as readonly TDynamicSecretProviderFormItem<TValues>[]}
              />
            )}
            {CustomRenderer && (
              <CustomRenderer
                mode={mode}
                context={context}
                setSubmitState={(state) =>
                  setProviderSubmitState((current) => ({ ...current, ...state }))
                }
              />
            )}
          </section>
        </div>

        <div
          data-slot="dynamic-secret-provider-form-footer"
          className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 @sm:flex-row @sm:items-center @sm:justify-end"
        >
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              className="@sm:mr-auto"
              onClick={onBack}
              isDisabled={isPending}
            >
              Back
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onCancel} isDisabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="project"
            isPending={isPending}
            isDisabled={providerSubmitState.isDisabled || isPending}
          >
            {mode === "create" ? definition.create.submitLabel : definition.edit.submitLabel}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};
