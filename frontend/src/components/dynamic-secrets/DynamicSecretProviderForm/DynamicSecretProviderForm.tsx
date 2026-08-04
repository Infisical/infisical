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
import { ExternalLinkIcon, HelpCircleIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useCreateDynamicSecret, useUpdateDynamicSecret } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import {
  DynamicSecretSheetContainer,
  DynamicSecretSheetContentSection,
  DynamicSecretSheetFooter,
  DynamicSecretSheetInputSection,
  DynamicSecretSheetScrollArea,
  DynamicSecretSheetSectionTitle
} from "../DynamicSecretSheet";
import { DynamicSecretProviderFormItems } from "./DynamicSecretProviderFormItems";
import {
  TCreateDynamicSecretProviderFormContext,
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

const TtlFieldLabel = ({
  htmlFor,
  label,
  description
}: {
  htmlFor: string;
  label: string;
  description?: string;
}) => (
  <div className="flex items-center gap-1.5">
    <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label} examples`}
          className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircleIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-lg">
        {description ?? (
          <span>
            Examples: 30m, 1h, 3d, etc.{" "}
            <a
              href="https://github.com/vercel/ms?tab=readme-ov-file#examples"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2"
            >
              See more examples <ExternalLinkIcon className="mb-0.5 inline size-3" />
            </a>
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  </div>
);

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
    // The provider definition guarantees that the mode-specific schema parses the shared form shape.
    resolver: zodResolver(schema) as Resolver<TValues>,
    defaultValues: defaultValues as DefaultValues<TValues>,
    values: mode === "edit" ? defaultValues : undefined,
    shouldFocusError: true
  });
  const [hasDirtyBaseline, setHasDirtyBaseline] = useState(false);

  // Re-baseline after mount-time control sync (e.g. Radix Select) so prefills aren't dirty.
  // Don't report dirty until that baseline lands — otherwise a close during the gap false-trips.
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
      return;
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
    await updateDynamicSecret.mutateAsync(payload);
    onCompleted();
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
  let commonFieldGrid = "sm:grid-cols-[minmax(0,1fr)_8rem_8rem]";
  if (ttlFieldCount === 0) commonFieldGrid = "sm:grid-cols-1";
  if (ttlFieldCount === 1) commonFieldGrid = "sm:grid-cols-[minmax(0,1fr)_8rem]";
  const nameError = form.formState.errors.name;
  const defaultTtlError = form.formState.errors.defaultTTL;
  const maxTtlError = form.formState.errors.maxTTL;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        autoComplete="off"
        noValidate
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <DynamicSecretSheetScrollArea>
          <DynamicSecretSheetContainer>
            {header}
            <DynamicSecretSheetInputSection>
              <div className={`grid grid-cols-1 gap-3 ${commonFieldGrid}`}>
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
                        <FieldError id="dynamic-secret-name-error">
                          {nameError?.message as string}
                        </FieldError>
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
                        <TtlFieldLabel
                          htmlFor="dynamic-secret-default-ttl"
                          label={commonFields?.defaultTTL?.label ?? "Default TTL"}
                          description={commonFields?.defaultTTL?.description}
                        />
                        <Input
                          ref={field.ref}
                          id="dynamic-secret-default-ttl"
                          name={field.name}
                          value={typeof field.value === "string" ? field.value : ""}
                          onBlur={field.onBlur}
                          onChange={field.onChange}
                          isError={Boolean(defaultTtlError)}
                          aria-describedby={
                            defaultTtlError ? "dynamic-secret-default-ttl-error" : undefined
                          }
                          disabled={commonFields?.defaultTTL?.isDisabled}
                        />
                        <FieldError id="dynamic-secret-default-ttl-error">
                          {defaultTtlError?.message as string}
                        </FieldError>
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
                        <TtlFieldLabel
                          htmlFor="dynamic-secret-max-ttl"
                          label={commonFields?.maxTTL?.label ?? "Max TTL"}
                          description={commonFields?.maxTTL?.description}
                        />
                        <Input
                          ref={field.ref}
                          id="dynamic-secret-max-ttl"
                          name={field.name}
                          value={typeof field.value === "string" ? field.value : ""}
                          onBlur={field.onBlur}
                          onChange={field.onChange}
                          isError={Boolean(maxTtlError)}
                          aria-describedby={maxTtlError ? "dynamic-secret-max-ttl-error" : undefined}
                          disabled={commonFields?.maxTTL?.isDisabled}
                        />
                        <FieldError id="dynamic-secret-max-ttl-error">
                          {maxTtlError?.message as string}
                        </FieldError>
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
                        <FilterableSelect
                          inputId="dynamic-secret-environment"
                          options={environments}
                          value={field.value ?? null}
                          onBlur={field.onBlur}
                          onChange={field.onChange}
                          getOptionLabel={(option) => option.name}
                          getOptionValue={(option) => option.slug}
                          placeholder="Select the environment to create secret in..."
                          isError={Boolean(error)}
                          aria-describedby={error ? "dynamic-secret-environment-error" : undefined}
                        />
                        <FieldError id="dynamic-secret-environment-error">
                          {error?.message}
                        </FieldError>
                      </Field>
                    )}
                  />
                )}
            </DynamicSecretSheetInputSection>

            <DynamicSecretSheetContentSection
              aria-labelledby={
                commonFields?.configurationHeading !== false
                  ? "dynamic-secret-configuration-heading"
                  : undefined
              }
            >
              {commonFields?.configurationHeading !== false && (
                <DynamicSecretSheetSectionTitle id="dynamic-secret-configuration-heading">
                  {commonFields?.configurationHeading ?? "Configuration"}
                </DynamicSecretSheetSectionTitle>
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
            </DynamicSecretSheetContentSection>
          </DynamicSecretSheetContainer>
        </DynamicSecretSheetScrollArea>

        <DynamicSecretSheetFooter>
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
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
        </DynamicSecretSheetFooter>
      </form>
    </FormProvider>
  );
};