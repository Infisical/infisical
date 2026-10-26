import { useEffect, useMemo, useRef, useState } from "react";
import {
  Controller,
  type FieldValues,
  FormProvider,
  type Resolver,
  useForm,
  useFormContext
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { getDynamicSecretProviderRuntimeMetadata } from "@app/components/dynamic-secrets/DynamicSecretProviderForm/runtimeMetadata";
import { useV4Theme } from "@app/components/v4/scope";
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
import { Combobox } from "@app/components/v4/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field, FieldDescription } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Media, Tile } from "@app/components/v4/ui/item";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Heading, Meta, SmallText } from "@app/components/v4/ui/text";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type { Resource } from "../../secrets-model";
import { ProviderFormItems } from "./dynamic-secret/fields";
import { dynamicSecretDocsSlug, dynamicSecretFlowProviders } from "./dynamic-secret/registry";
import type {
  DynamicSecretEditContext,
  DynamicSecretFlowContext,
  DynamicSecretFlowProvider
} from "./dynamic-secret/types";

export type DynamicSecretResource = Extract<Resource, { kind: "dynamic" }>;

export type DynamicSecretFlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  environments: readonly { value: string; label: string }[];
  environment?: string;
  secretPath: string;
  onCreate: (resources: DynamicSecretResource[]) => boolean;
};

const FORM_ID = "dynamic-secret-flow-form";
const EDIT_FORM_ID = "dynamic-secret-edit-form";
const ON_LIGHT_LOGOS: Record<string, string> = {
  "Amazon Web Services.png": "Amazon Web Services.on-light.png",
  "GitHub.png": "GitHub.on-light.png",
  "Kafka.png": "Kafka.on-light.png",
  "SSH.png": "SSH.on-light.png"
};

function ProviderLogo({ provider }: { provider: DynamicSecretProviders }) {
  const theme = useV4Theme();
  const { providerFamily, logoFileName } =
    getDynamicSecretProviderRuntimeMetadata(provider).presentation;
  return (
    <Media>
      {logoFileName ? (
        <img
          src={`/images/integrations/${theme === "light" ? (ON_LIGHT_LOGOS[logoFileName] ?? logoFileName) : logoFileName}`}
          alt={`${providerFamily} logo`}
          width={20}
          height={20}
        />
      ) : (
        <Icon name="key" />
      )}
    </Media>
  );
}

const providerResolver = (
  current: () => { schema: DynamicSecretFlowProvider["schema"] } | undefined
): Resolver<FieldValues> =>
  ((values, resolverContext, options) => {
    const definition = current();
    return definition
      ? zodResolver(definition.schema)(values, resolverContext, options)
      : { values, errors: {} };
  }) as Resolver<FieldValues>;

function DynamicSecretFormSections({
  mode,
  definition,
  context,
  setSubmitState
}: {
  mode: "create" | "edit";
  definition: DynamicSecretFlowProvider;
  context: DynamicSecretFlowContext;
  setSubmitState: (state: { isDisabled?: boolean; isPending?: boolean }) => void;
}) {
  const { control } = useFormContext<FieldValues>();
  const modeDefinition = mode === "create" ? definition : definition.edit;
  const { commonFields } = modeDefinition;
  const fields = mode === "create" ? definition.fields : undefined;
  const Renderer = modeDefinition.Renderer ?? definition.Renderer;
  const ttlCount =
    Number(commonFields?.defaultTTL?.isVisible !== false) +
    Number(commonFields?.maxTTL?.isVisible !== false);
  let nameSpan = "col-span-3";
  if (ttlCount === 1) nameSpan = "col-span-4";
  if (ttlCount === 0) nameSpan = "col-span-5";

  return (
    <Stack gap={24}>
      <Stack gap={16} aria-label="Dynamic secret details">
        <div className="grid grid-cols-5 gap-3">
          {commonFields?.name?.isVisible !== false && (
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field
                  wide
                  className={nameSpan}
                  label={commonFields?.name?.label ?? "Secret Name"}
                  description={commonFields?.name?.description}
                  error={error?.message}
                >
                  <Input
                    {...field}
                    value={typeof field.value === "string" ? field.value : ""}
                    placeholder="dynamic-secret"
                    disabled={commonFields?.name?.isDisabled}
                  />
                </Field>
              )}
            />
          )}
          {commonFields?.defaultTTL?.isVisible !== false && (
            <Controller
              control={control}
              name="defaultTTL"
              render={({ field, fieldState: { error } }) => (
                <Field
                  wide
                  label={commonFields?.defaultTTL?.label ?? "Default TTL"}
                  description={commonFields?.defaultTTL?.description}
                  error={error?.message}
                >
                  <Input
                    {...field}
                    value={typeof field.value === "string" ? field.value : ""}
                    disabled={commonFields?.defaultTTL?.isDisabled}
                  />
                </Field>
              )}
            />
          )}
          {commonFields?.maxTTL?.isVisible !== false && (
            <Controller
              control={control}
              name="maxTTL"
              render={({ field, fieldState: { error } }) => (
                <Field
                  wide
                  label={commonFields?.maxTTL?.label ?? "Max TTL"}
                  description={commonFields?.maxTTL?.description}
                  error={error?.message}
                >
                  <Input
                    {...field}
                    value={typeof field.value === "string" ? field.value : ""}
                    disabled={commonFields?.maxTTL?.isDisabled}
                  />
                </Field>
              )}
            />
          )}
        </div>
        {commonFields?.ttlDescription && ttlCount > 0 && (
          <FieldDescription>{commonFields.ttlDescription}</FieldDescription>
        )}
        {mode === "create" &&
          !context.isSingleEnvironmentMode &&
          commonFields?.environment?.isVisible !== false && (
            <Controller
              control={control}
              name="environment"
              render={({ field, fieldState: { error } }) => (
                <Field
                  wide
                  label={commonFields?.environment?.label ?? "Environment"}
                  description={commonFields?.environment?.description}
                  error={error?.message}
                >
                  <Combobox
                    label="Environment"
                    options={context.environments.map((item) => ({
                      value: item.slug,
                      label: item.name
                    }))}
                    value={(field.value as { slug?: string } | undefined)?.slug ?? ""}
                    placeholder="Select the environment to create the secret in..."
                    disabled={commonFields?.environment?.isDisabled}
                    invalid={Boolean(error)}
                    onChange={(slug) => {
                      const match = context.environments.find((item) => item.slug === slug);
                      field.onChange(match ? { name: match.name, slug: match.slug } : undefined);
                    }}
                  />
                </Field>
              )}
            />
          )}
      </Stack>
      <Stack gap={16}>
        {commonFields?.configurationHeading !== false && (
          <Heading level={3} size="subsection">
            {commonFields?.configurationHeading ?? "Configuration"}
          </Heading>
        )}
        {fields && <ProviderFormItems items={fields} />}
        {Renderer && <Renderer mode={mode} context={context} setSubmitState={setSubmitState} />}
      </Stack>
    </Stack>
  );
}

export function DynamicSecretFlow({
  open,
  onOpenChange,
  project,
  environments,
  environment,
  secretPath,
  onCreate
}: DynamicSecretFlowProps) {
  const [provider, setProvider] = useState<DynamicSecretProviders>();
  const [search, setSearch] = useState("");
  const [discardAction, setDiscardAction] = useState<"back" | "close" | null>(null);
  const [submitState, setSubmitState] = useState({ isDisabled: false, isPending: false });
  const [sshSetupOpen, setSshSetupOpen] = useState(false);
  const definition = dynamicSecretFlowProviders.find((item) => item.provider === provider);
  const definitionRef = useRef(definition);
  const sheetRef = useRef<HTMLDivElement>(null);
  definitionRef.current = definition;

  const context = useMemo<DynamicSecretFlowContext>(() => {
    const projectEnvironments = environments
      .filter((item) => !environment || item.value === environment)
      .map((item) => ({ id: item.value, name: item.label, slug: item.value }));
    return {
      projectSlug: project,
      secretPath,
      environments: projectEnvironments,
      isSingleEnvironmentMode: Boolean(environment)
    };
  }, [environment, environments, project, secretPath]);

  const form = useForm<FieldValues>({
    resolver: providerResolver(() => definitionRef.current),
    shouldFocusError: true
  });
  const { isDirty } = form.formState;

  const providers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return dynamicSecretFlowProviders;
    return dynamicSecretFlowProviders.filter((item) =>
      [
        item.label,
        getDynamicSecretProviderRuntimeMetadata(item.provider).presentation.providerFamily,
        item.provider
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [search]);

  const scrollToTop = () => {
    sheetRef.current?.querySelector("[data-slot=sheet-scroll]")?.scrollTo({ top: 0 });
  };
  const selectProvider = (next: DynamicSecretProviders) => {
    const selected = dynamicSecretFlowProviders.find((item) => item.provider === next);
    if (!selected) return;
    scrollToTop();
    definitionRef.current = selected;
    form.reset(selected.getDefaultValues(context));
    setSubmitState({ isDisabled: false, isPending: false });
    setProvider(next);
    window.setTimeout(() => form.reset(form.getValues()), 0);
  };
  const back = () => {
    scrollToTop();
    setProvider(undefined);
    form.reset({});
  };
  const close = () => {
    setProvider(undefined);
    setSearch("");
    setSshSetupOpen(false);
    form.reset({});
    onOpenChange(false);
  };
  const requestBack = () => (isDirty ? setDiscardAction("back") : back());
  const requestClose = () => (isDirty ? setDiscardAction("close") : close());

  const submit = form.handleSubmit((values) => {
    if (!definition) return;
    const payload = definition.toPayload(values, context);
    const payloads = Array.isArray(payload) ? payload : [payload];
    const now = new Date().toISOString();
    const created = onCreate(
      payloads.map((item) => ({
        kind: "dynamic",
        id: `${project}:${item.environmentSlug}:${item.path}:dynamic:${item.name}`,
        project,
        environment: item.environmentSlug,
        path: item.path,
        name: item.name,
        provider: definition.label,
        defaultTTL: item.defaultTTL,
        maxTTL: item.maxTTL || undefined,
        config: {
          type: definition.provider,
          inputs: item.provider.inputs,
          usernameTemplate: item.usernameTemplate,
          metadata: item.metadata
        },
        createdAt: now,
        updatedAt: now
      }))
    );
    if (!created) return;
    if (definition.provider === DynamicSecretProviders.Ssh) {
      setSshSetupOpen(true);
      return;
    }
    close();
  });

  const isPending = form.formState.isSubmitting || submitState.isPending;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && requestClose()}>
        <SheetContent ref={sheetRef} className="w-full data-[side=right]:sm:max-w-3xl">
          {!definition && (
            <SheetHeader>
              <SheetTitle>Choose a Dynamic Secret Provider</SheetTitle>
              <SheetDescription>
                Select the provider whose credentials Infisical should generate.
              </SheetDescription>
            </SheetHeader>
          )}
          {!definition && (
            <SheetBody>
              <Stack gap={24}>
                <Input
                  icon="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search providers, such as SQL, AWS, MongoDB..."
                  aria-label="Search dynamic secret providers"
                />
                <Stack gap={12}>
                  <SmallText muted>All providers</SmallText>
                  {providers.length ? (
                    <Grid columns={2} gap={12}>
                      {providers.map((item) => (
                        <Tile
                          key={item.provider}
                          media={<ProviderLogo provider={item.provider} />}
                          title={item.label}
                          onClick={() => selectProvider(item.provider)}
                        >
                          <Meta mono={false} className="block">
                            Generate time-limited {item.label} credentials on demand.
                          </Meta>
                          <Meta mono={false} className="block">
                            {
                              getDynamicSecretProviderRuntimeMetadata(item.provider).presentation
                                .providerFamily
                            }
                          </Meta>
                        </Tile>
                      ))}
                    </Grid>
                  ) : (
                    <EmptyState
                      icon="search"
                      title="No matching providers"
                      description="Try a different search term."
                    />
                  )}
                </Stack>
              </Stack>
            </SheetBody>
          )}
          {definition && (
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8}>
                  Add {definition.label} Dynamic Secret
                  <Badge tone="info" asChild>
                    <a
                      href={`https://infisical.com/docs/documentation/platform/dynamic-secrets/${dynamicSecretDocsSlug(definition.provider)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Documentation
                      <Icon name="external" />
                    </a>
                  </Badge>
                </Inline>
              </SheetTitle>
              <SheetDescription>Configure dynamic secret parameters.</SheetDescription>
            </SheetHeader>
          )}
          {definition && (
            <SheetBody>
              <FormProvider {...form}>
                <form id={FORM_ID} onSubmit={submit} autoComplete="off" noValidate>
                  <DynamicSecretFormSections
                    mode="create"
                    definition={definition}
                    context={context}
                    setSubmitState={(state) =>
                      setSubmitState((current) => ({ ...current, ...state }))
                    }
                  />
                </form>
              </FormProvider>
            </SheetBody>
          )}
          {definition && (
            <SheetFooter>
              <Inline gap={8} justify="end">
                <Button type="button" variant="ghost" onClick={requestBack} disabled={isPending}>
                  Back
                </Button>
                <Button type="button" variant="ghost" onClick={requestClose} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form={FORM_ID}
                  loading={isPending}
                  disabled={submitState.isDisabled || isPending}
                >
                  {definition.submitLabel}
                </Button>
              </Inline>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={discardAction !== null}
        onOpenChange={(next) => !next && setDiscardAction(null)}
      >
        <AlertDialogContent tone="danger" icon="alert">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Dynamic Secret Setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress configuring this dynamic secret will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = discardAction;
                setDiscardAction(null);
                if (action === "back") back();
                else close();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={sshSetupOpen} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Certificate Authentication Setup</DialogTitle>
            <DialogDescription>
              Configure the target host to trust certificates issued by this dynamic secret.
            </DialogDescription>
          </DialogHeader>
          <Stack gap={16}>
            <Field
              wide
              label="Run this command on the target host:"
              description="No certificate authority exists in this local preview, so there is no setup command to copy."
            >
              <Input value="" readOnly disabled />
            </Field>
            <Field
              wide
              label="Or install the CA public key manually:"
              description="No certificate authority exists in this local preview, so there is no public key to copy."
            >
              <Input value="" readOnly disabled />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" onClick={close}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const FAKE_INPUTS: Partial<Record<DynamicSecretProviders, Record<string, unknown>>> = {
  [DynamicSecretProviders.SqlDatabase]: {
    host: "fake-db.payments.internal",
    database: "payments",
    username: "fake-admin",
    password: "fake-password"
  }
};

export const dynamicSecretDefinitionFor = (entry: DynamicSecretResource) =>
  dynamicSecretFlowProviders.find((item) =>
    entry.config ? item.provider === entry.config.type : item.label === entry.provider
  ) ??
  dynamicSecretFlowProviders.find((item) => item.provider === DynamicSecretProviders.SqlDatabase);

const editContextFor = (
  entry: DynamicSecretResource,
  definition: DynamicSecretFlowProvider
): DynamicSecretEditContext => {
  const fallback = () => {
    const defaults = definition.getDefaultValues({
      projectSlug: entry.project,
      secretPath: entry.path,
      environments: [{ id: entry.environment, name: entry.environment, slug: entry.environment }],
      isSingleEnvironmentMode: true
    }) as {
      inputs?: Record<string, unknown>;
      usernameTemplate?: string | null;
    };
    return {
      type: definition.provider,
      inputs: { ...defaults.inputs, ...FAKE_INPUTS[definition.provider] },
      usernameTemplate: defaults.usernameTemplate,
      metadata: []
    };
  };
  const config = entry.config ?? fallback();
  return {
    projectSlug: entry.project,
    secretPath: entry.path,
    environment: entry.environment,
    dynamicSecret: {
      id: entry.id,
      name: entry.name,
      type: definition.provider,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      defaultTTL: entry.defaultTTL,
      maxTTL: entry.maxTTL,
      usernameTemplate: config.usernameTemplate,
      metadata: config.metadata ?? [],
      inputs: config.inputs
    }
  };
};

export function DynamicSecretEditSheet({
  entry: openEntry,
  onClose,
  onSave
}: {
  entry?: DynamicSecretResource;
  onClose: () => void;
  onSave: (entry: DynamicSecretResource, successMessage: string) => boolean;
}) {
  const lastEntry = useRef(openEntry);
  if (openEntry) lastEntry.current = openEntry;
  const entry = openEntry ?? lastEntry.current;
  const definition = entry && dynamicSecretDefinitionFor(entry);
  const editContext = useMemo(
    () => (entry && definition ? editContextFor(entry, definition) : undefined),
    [definition, entry]
  );
  const definitionRef = useRef(definition?.edit);
  definitionRef.current = definition?.edit;
  const [discardOpen, setDiscardOpen] = useState(false);
  const [submitState, setSubmitState] = useState({ isDisabled: false, isPending: false });
  const form = useForm<FieldValues>({
    resolver: providerResolver(() => definitionRef.current),
    shouldFocusError: true
  });

  useEffect(() => {
    if (!definition || !editContext) return undefined;
    form.reset(definition.edit.getDefaultValues(editContext));
    setSubmitState({ isDisabled: false, isPending: false });
    const timer = window.setTimeout(() => form.reset(form.getValues()), 0);
    return () => window.clearTimeout(timer);
  }, [definition, editContext, form]);

  const context = useMemo<DynamicSecretFlowContext | undefined>(
    () =>
      entry && {
        projectSlug: entry.project,
        secretPath: entry.path,
        environments: [{ id: entry.environment, name: entry.environment, slug: entry.environment }],
        isSingleEnvironmentMode: true
      },
    [entry]
  );

  const requestClose = () => (form.formState.isDirty ? setDiscardOpen(true) : onClose());
  const submit = form.handleSubmit((values) => {
    if (!entry || !definition || !editContext) return;
    const { data } = definition.edit.toPayload(values, editContext);
    const current = editContext.dynamicSecret.inputs;
    const saved = onSave(
      {
        ...entry,
        name: data.newName ?? entry.name,
        defaultTTL: data.defaultTTL ?? entry.defaultTTL,
        maxTTL: data.maxTTL ?? undefined,
        config: {
          type: definition.provider,
          inputs:
            data.inputs && typeof data.inputs === "object" && current && typeof current === "object"
              ? { ...current, ...data.inputs }
              : (data.inputs ?? current),
          usernameTemplate: data.usernameTemplate,
          metadata: data.metadata
        },
        updatedAt: new Date().toISOString()
      },
      definition.edit.successMessage
    );
    if (saved) onClose();
  });
  const isPending = form.formState.isSubmitting || submitState.isPending;

  return (
    <>
      <Sheet open={Boolean(openEntry)} onOpenChange={(next) => !next && requestClose()}>
        <SheetContent className="w-full data-[side=right]:sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Edit dynamic secret</SheetTitle>
            <SheetDescription>Update dynamic secret parameters.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {definition && context && (
              <FormProvider {...form}>
                <form id={EDIT_FORM_ID} onSubmit={submit} autoComplete="off" noValidate>
                  <DynamicSecretFormSections
                    key={entry?.id}
                    mode="edit"
                    definition={definition}
                    context={context}
                    setSubmitState={(state) =>
                      setSubmitState((current) => ({ ...current, ...state }))
                    }
                  />
                </form>
              </FormProvider>
            )}
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              <Button type="button" variant="ghost" onClick={requestClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={EDIT_FORM_ID}
                loading={isPending}
                disabled={submitState.isDisabled || isPending}
              >
                {definition?.edit.submitLabel ?? "Save"}
              </Button>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent tone="danger" icon="alert">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard dynamic secret changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes to this dynamic secret will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false);
                onClose();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
