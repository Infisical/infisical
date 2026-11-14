import { useMemo, useState } from "react";
import { Controller, type FieldValues, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useScheme } from "@infisical/cipher/scope";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Media, Tile } from "@infisical/cipher/ui/item";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { Steps } from "@infisical/cipher/ui/multi-step";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Switch } from "@infisical/cipher/ui/switch";
import { Heading, SmallText } from "@infisical/cipher/ui/text";

import {
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { AppConnection as ApiAppConnection } from "@app/hooks/api/appConnections/enums";

import { useV4Adapter } from "../../../../data/adapters";
import type { Resource } from "../../secrets-model";
import { useCreateBlock } from "../row-actions/permissions";
import { useConnectionCreation } from "./connection-creation";
import { ReviewSection, RotationField, TextField, useRotationForm } from "./secret-rotation/fields";
import {
  appConnectionName,
  DEFAULT_ROTATION_INTERVAL,
  nextRotationFrom,
  ROTATION_TEMPLATES,
  type RotationConnection,
  type RotationEnvironment,
  rotationFormValues,
  type RotationResource,
  rotationSecretsMapping,
  rotationTypeOf
} from "./secret-rotation/model";
import { ROTATION_VIEWS } from "./secret-rotation/registry";
import {
  type AppConnection,
  getSecretRotationConnectionApps,
  IS_ROTATION_DUAL_CREDENTIALS,
  SECRET_ROTATION_MAP,
  SecretRotation,
  SecretRotationV2FormSchema
} from "./secret-rotation/schemas";
import { Gate } from "./shared";

export type { RotationResource };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  environments: { value: string; label: string }[];
  environment?: string;
  secretPath: string;
  resources: Resource[];
  onCreate?: (resource: RotationResource) => void;
  rotation?: RotationResource;
  onUpdate?: (rotation: RotationResource) => void;
};

const FORM_STEPS = [
  {
    name: "Configuration",
    title: "Configure the rotation",
    fields: [
      "isAutoRotationEnabled",
      "environment",
      "rotationInterval",
      "connection",
      "rotateAtUtc"
    ]
  },
  {
    name: "Parameters",
    title: "Set provider parameters",
    fields: ["parameters", "temporaryParameters"]
  },
  {
    name: "Mappings",
    title: "Map generated credentials",
    fields: ["secretsMapping"]
  },
  {
    name: "Details",
    title: "Add rotation details",
    fields: ["name", "description"]
  },
  {
    name: "Review",
    title: "Review the rotation",
    fields: []
  }
];

const docsHref = (type: SecretRotation) =>
  `https://infisical.com/docs/documentation/platform/secret-rotation/${type}`;

const getRotateAtLocal = ({ hours, minutes }: { hours: number; minutes: number }) => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hours, minutes, 0, 0)
  );
};
const pad = (value: number) => String(value).padStart(2, "0");

const LIGHT_LOGOS: Record<string, string> = {
  "DatadogWhite.png": "Datadog.png",
  "Amazon Web Services.png": "Amazon Web Services.on-light.png",
  "SSH.png": "SSH.on-light.png"
};

function ProviderLogo({ type, size = "md" }: { type: SecretRotation; size?: "sm" | "md" }) {
  const theme = useScheme();
  const { image, name } = SECRET_ROTATION_MAP[type];
  const source = theme === "light" ? (LIGHT_LOGOS[image] ?? image) : image;
  return (
    <Media size={size}>
      <img src={`/images/integrations/${source}`} alt={`${name} logo`} width={20} height={20} />
    </Media>
  );
}

function DocsLink({ type }: { type: SecretRotation }) {
  return (
    <Button asChild variant="link" size="sm">
      <a href={docsHref(type)} target="_blank" rel="noopener noreferrer">
        Docs
        <Icon name="external" />
      </a>
    </Button>
  );
}

function ProviderSelect({ onSelect }: { onSelect: (type: SecretRotation) => void }) {
  const [search, setSearch] = useState("");
  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all = Object.values(SecretRotation).sort((first, second) =>
      SECRET_ROTATION_MAP[first].name.localeCompare(SECRET_ROTATION_MAP[second].name)
    );
    if (!query) return all;
    return all.filter((type) =>
      [
        SECRET_ROTATION_MAP[type].name,
        ...getSecretRotationConnectionApps(type).map(appConnectionName),
        type
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [search]);
  return (
    <Stack gap={24}>
      <Input
        icon="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search providers like PostgreSQL, AWS, Cloudflare..."
        aria-label="Search secret rotation providers"
      />
      <Stack gap={12}>
        <SmallText muted>All providers</SmallText>
        {options.length ? (
          <Grid columns={3} gap={12}>
            {options.map((type) => (
              <Tile
                key={type}
                media={<ProviderLogo type={type} />}
                title={SECRET_ROTATION_MAP[type].name}
                onClick={() => onSelect(type)}
              >
                <SmallText muted>
                  {getSecretRotationConnectionApps(type).map(appConnectionName).join(" or ")}
                </SmallText>
              </Tile>
            ))}
          </Grid>
        ) : (
          <EmptyState
            icon="search"
            title={search.trim() ? "No matching providers" : "No providers available"}
          />
        )}
      </Stack>
    </Stack>
  );
}

function ConfigurationFields({
  isUpdate,
  project,
  environments,
  addedConnections,
  onCreateConnection
}: {
  isUpdate: boolean;
  project: string;
  environments?: RotationEnvironment[];
  addedConnections: RotationConnection[];
  onCreateConnection: (connection: RotationConnection) => void;
}) {
  const { control, getValues, setValue } = useRotationForm();
  const [type, isAutoRotationEnabled] = useWatch({
    control,
    name: ["type", "isAutoRotationEnabled"]
  }) as [SecretRotation, boolean];
  const apps = getSecretRotationConnectionApps(type);
  const app = apps[0];
  const loaded = useV4Adapter("secrets").useAvailableConnections(
    apps.map((entry) => entry as string as ApiAppConnection),
    project
  );
  const available = [
    ...loaded.connections.map(({ id, name, app: connectionApp }) => ({
      id,
      name,
      app: connectionApp as string as AppConnection
    })),
    ...addedConnections
  ].filter(
    (connection, index, all) =>
      apps.includes(connection.app) &&
      all.findIndex((entry) => entry.id === connection.id) === index
  );
  const creation = useConnectionCreation(app as string as ApiAppConnection, project, (created) => {
    const connection = { ...created, app: created.app as string as AppConnection };
    onCreateConnection(connection);
    setValue("connection", connection, { shouldValidate: true, shouldDirty: true });
  });
  const connectionLabel = apps.length > 1 ? "Connection" : `${appConnectionName(app)} Connection`;
  return (
    <Stack gap={16}>
      {!isUpdate && environments && (
        <Controller
          control={control}
          name="environment"
          render={({ field, fieldState: { error } }) => (
            <RotationField label="Environment" error={error?.message}>
              <Combobox
                label="Environment"
                value={field.value?.id ?? ""}
                onValueChange={(id) =>
                  field.onChange(environments.find((environment) => environment.id === id))
                }
                options={environments.map((environment) => ({
                  value: environment.id,
                  label: environment.name
                }))}
                placeholder="Select an environment..."
                invalid={Boolean(error)}
              />
            </RotationField>
          )}
        />
      )}
      <Controller
        control={control}
        name="connection"
        render={({ field, fieldState: { error } }) => (
          <RotationField
            label={connectionLabel}
            error={error?.message ?? error?.root?.message}
            description={
              isUpdate ? (
                "Cannot be updated"
              ) : (
                <>
                  See{" "}
                  <a
                    href={`https://infisical.com/docs/integrations/app-connections/${field.value?.app ?? app}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    our docs
                  </a>{" "}
                  for the permissions this connection needs.
                </>
              )
            }
          >
            <Combobox
              label={connectionLabel}
              value={field.value?.id ?? ""}
              onValueChange={(id) =>
                field.onChange(
                  available.find((entry) => entry.id === id) ??
                    (getValues("connection")?.id === id ? getValues("connection") : undefined)
                )
              }
              options={available.map((connection) => ({
                value: connection.id,
                label: connection.name,
                meta: apps.length > 1 ? appConnectionName(connection.app) : undefined
              }))}
              placeholder="Select connection..."
              emptyText={`No ${apps.map(appConnectionName).join(" or ")} connections yet.`}
              invalid={Boolean(error)}
              disabled={isUpdate}
              loading={loaded.isPending}
              creation={isUpdate ? undefined : creation}
            />
          </RotationField>
        )}
      />
      <TextField
        name="rotationInterval"
        label="Rotation Interval (In Days)"
        placeholder="30"
        type="number"
      />
      <Controller
        control={control}
        name="rotateAtUtc"
        render={({ field, fieldState: { error } }) => {
          const local = getRotateAtLocal(field.value);
          return (
            <RotationField label="Rotate At (Local Time)" error={error?.message}>
              <Input
                ref={field.ref}
                type="time"
                value={`${pad(local.getHours())}:${pad(local.getMinutes())}`}
                onBlur={field.onBlur}
                onChange={(event) => {
                  const time = event.target.value;
                  if (!time) return;
                  const [hours, minutes] = time.split(":").map((part) => parseInt(part, 10));
                  const selected = new Date();
                  selected.setHours(hours, minutes, 0, 0);
                  const next = { hours: selected.getUTCHours(), minutes: selected.getUTCMinutes() };
                  if (next.hours === field.value.hours && next.minutes === field.value.minutes)
                    return;
                  field.onChange(next);
                }}
              />
            </RotationField>
          );
        }}
      />
      <Controller
        control={control}
        name="isAutoRotationEnabled"
        render={({ field }) => (
          <Switch
            ref={field.ref}
            layout="row"
            label={`Auto-Rotation ${field.value ? "Enabled" : "Disabled"}`}
            description={field.value ? undefined : "You can still rotate secrets manually."}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />
      {!IS_ROTATION_DUAL_CREDENTIALS[type] && isAutoRotationEnabled && (
        <Alert tone="warn">
          {SECRET_ROTATION_MAP[type].name} rotates a single credential set, so auto-rotation can
          interrupt services that use it. Turn it off if you need continuity.{" "}
          <a
            href="https://infisical.com/docs/documentation/platform/secret-rotation/overview#how-rotation-works"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read more
          </a>
          .
        </Alert>
      )}
    </Stack>
  );
}

function DetailsFields() {
  return (
    <Stack gap={16}>
      <TextField
        name="name"
        label="Name"
        placeholder="my-secret-rotation"
        description="Must be slug-friendly"
      />
      <TextField
        name="description"
        label="Description"
        optional
        placeholder="Describe the purpose of this rotation..."
        multiline
        rows={4}
      />
    </Stack>
  );
}

function ReviewFields() {
  const { control } = useRotationForm();
  const values = useWatch({ control }) as FieldValues;
  const type = values.type as SecretRotation;
  const TypeReview = ROTATION_VIEWS[type].Review;
  const interval = Number(values.rotationInterval);
  const local = getRotateAtLocal(values.rotateAtUtc);
  const hours = local.getHours() % 12 || 12;
  return (
    <Stack gap={24}>
      <ReviewSection
        label="Configuration"
        items={[
          ["Connection", values.connection?.name],
          ["Environment", values.environment?.name],
          ["Secret Path", values.secretPath],
          ["Rotation Interval", `${values.rotationInterval} Day${interval > 1 ? "s" : ""}`],
          [
            "Rotate At",
            `${hours}:${pad(local.getMinutes())} ${local.getHours() < 12 ? "AM" : "PM"}`
          ]
        ]}
      />
      <TypeReview />
      <ReviewSection
        label="Details"
        items={[
          ["Name", values.name],
          ["Description", values.description]
        ]}
      />
    </Stack>
  );
}

const defaultsFor = (
  type: SecretRotation,
  secretPath: string,
  environment?: RotationEnvironment
): FieldValues => ({
  type,
  isAutoRotationEnabled: IS_ROTATION_DUAL_CREDENTIALS[type],
  rotationInterval: DEFAULT_ROTATION_INTERVAL,
  rotateAtUtc: { hours: 0, minutes: 0 },
  environment,
  secretPath,
  parameters: ROTATION_TEMPLATES[type].parameters,
  secretsMapping: { ...ROTATION_TEMPLATES[type].secretsMapping }
});

function RotationSteps({
  isUpdate,
  type,
  step,
  onStep,
  onCancel,
  project,
  environments,
  addedConnections,
  onCreateConnection
}: {
  isUpdate: boolean;
  type: SecretRotation;
  step: number;
  onStep: (step: number) => void;
  onCancel: () => void;
  project: string;
  environments: RotationEnvironment[];
  addedConnections: RotationConnection[];
  onCreateConnection: (connection: RotationConnection) => void;
}) {
  const Views = ROTATION_VIEWS[type];
  const current = FORM_STEPS[step];
  const offset = isUpdate ? 0 : 1;
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col gap-5 border-r border-[color:var(--cipher-line-soft)] px-5 py-6">
        <SmallText muted>Setup steps</SmallText>
        <Steps
          orientation="vertical"
          label="Setup steps"
          current={step + offset}
          steps={[
            ...(isUpdate ? [] : [{ title: "Provider", summary: SECRET_ROTATION_MAP[type].name }]),
            ...FORM_STEPS.map((entry) => ({ title: entry.name }))
          ]}
          onStepClick={(index) => {
            if (!isUpdate && index === 0) {
              onCancel();
              return;
            }
            if (index - offset < step) onStep(index - offset);
          }}
        />
      </aside>
      <form
        data-scroll-fade="y"
        className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <Heading level={2} size="subsection">
          {current.title}
        </Heading>
        {step === 0 && (
          <ConfigurationFields
            isUpdate={isUpdate}
            environments={environments}
            project={project}
            addedConnections={addedConnections}
            onCreateConnection={onCreateConnection}
          />
        )}
        {step === 1 && (
          <Stack gap={16}>
            <Views.Parameters />
          </Stack>
        )}
        {step === 2 && (
          <Stack gap={16}>
            <Views.Mappings />
          </Stack>
        )}
        {step === 3 && <DetailsFields />}
        {step === 4 && <ReviewFields />}
      </form>
    </div>
  );
}

export function SecretRotationFlow({
  open,
  onOpenChange,
  project,
  environments,
  environment,
  secretPath,
  resources,
  onCreate,
  rotation,
  onUpdate
}: Props) {
  const isUpdate = Boolean(rotation);
  const rotationEnvironments = environments.map((entry) => ({
    id: entry.value,
    slug: entry.value,
    name: entry.label
  }));
  const [type, setType] = useState<SecretRotation | null>(
    rotation ? rotationTypeOf(rotation) : null
  );
  const [step, setStep] = useState(0);
  const [discard, setDiscard] = useState<"close" | "provider" | null>(null);
  const [addedConnections, setAddedConnections] = useState<RotationConnection[]>([]);
  const form = useForm<FieldValues>({
    resolver: zodResolver(SecretRotationV2FormSchema(isUpdate)),
    defaultValues: rotation
      ? rotationFormValues(
          rotation,
          resources,
          rotationEnvironments.find((entry) => entry.slug === rotation.environment) ?? {
            id: rotation.environment,
            slug: rotation.environment,
            name: rotation.environment
          }
        )
      : undefined,
    mode: "onChange",
    reValidateMode: "onChange"
  });
  const { isDirty } = form.formState;
  const select = (next: SecretRotation) => {
    form.reset(
      defaultsFor(
        next,
        secretPath,
        rotationEnvironments.find((entry) => entry.slug === environment)
      )
    );
    setStep(0);
    setType(next);
  };
  const reset = () => setType(null);
  const close = () => {
    if (!isUpdate) reset();
    onOpenChange(false);
  };
  const request = (target: "close" | "provider") => {
    if (type && isDirty) {
      setDiscard(target);
      return;
    }
    if (target === "close") close();
    else reset();
  };
  const conflict = (values: FieldValues) => {
    const path = values.secretPath as string;
    const env = values.environment as RotationEnvironment;
    const { fields } = FORM_STEPS[step];
    const scoped = resources.filter(
      (entry) => entry.project === project && entry.environment === env.slug && entry.path === path
    );
    if (fields.includes("secretsMapping")) {
      const current = new Set(rotation ? Object.values(rotationSecretsMapping(rotation)) : []);
      const existing = new Set(
        scoped.filter((entry) => entry.kind === "secret").map((entry) => entry.name)
      );
      const seen = new Set<string>();
      for (const [credential, key] of Object.entries(
        values.secretsMapping as Record<string, string>
      )) {
        const field = `secretsMapping.${credential}`;
        if (seen.has(key))
          return { field, message: "Use a different secret name for each credential." };
        if (existing.has(key) && !current.has(key))
          return { field, message: `A secret named "${key}" already exists at "${path}".` };
        seen.add(key);
      }
    }
    if (
      fields.includes("name") &&
      scoped.some(
        (entry) =>
          entry.kind === "rotation" && entry.name === values.name && entry.id !== rotation?.id
      )
    )
      return {
        field: "name",
        message: `A secret rotation named "${values.name}" already exists at "${path}".`
      };
    return undefined;
  };
  const submit = (values: FieldValues) => {
    const env = values.environment as RotationEnvironment;
    const now = new Date();
    const secretsMapping = values.secretsMapping as Record<string, string>;
    const configured = {
      name: values.name,
      autoRotation: values.isAutoRotationEnabled,
      description: values.description || undefined,
      managedKeys: Object.values(secretsMapping),
      type: values.type,
      rotationInterval: Number(values.rotationInterval),
      rotateAtUtc: values.rotateAtUtc,
      parameters: values.parameters,
      secretsMapping
    };
    if (rotation) {
      onUpdate?.({
        ...rotation,
        ...configured,
        updatedAt: now.toISOString(),
        nextRotationAt: values.isAutoRotationEnabled
          ? nextRotationFrom(
              new Date(rotation.lastRotatedAt),
              configured.rotationInterval,
              values.rotateAtUtc
            )
          : undefined
      });
      close();
      return;
    }
    onCreate?.({
      ...configured,
      kind: "rotation",
      id: `${project}:${env.slug}:${values.secretPath}:rotation:${values.name}`,
      project,
      environment: env.slug,
      path: values.secretPath,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      provider: SECRET_ROTATION_MAP[values.type as SecretRotation].name,
      connection: values.connection.name,
      connectionId: values.connection.id,
      status: "success",
      lastRotatedAt: now.toISOString(),
      nextRotationAt: values.isAutoRotationEnabled
        ? nextRotationFrom(now, configured.rotationInterval, values.rotateAtUtc)
        : undefined
    });
    close();
  };
  const isFinalStep = step === FORM_STEPS.length - 1;
  const formEnvironment = form.watch("environment") as RotationEnvironment | undefined;
  let submitEnvironments = rotationEnvironments.map((entry) => entry.slug);
  if (formEnvironment) submitEnvironments = [formEnvironment.slug];
  if (rotation) submitEnvironments = [rotation.environment];
  const submitBlock = useCreateBlock(
    project,
    ProjectPermissionSub.SecretRotation,
    isUpdate
      ? ProjectPermissionSecretRotationActions.Edit
      : ProjectPermissionSecretRotationActions.Create,
    submitEnvironments,
    rotation?.path ?? secretPath,
    isUpdate ? "edit this rotation" : "create secret rotations here"
  );
  const handleNext = async () => {
    if (isFinalStep) {
      await form.handleSubmit(submit)();
      return;
    }
    if (!(await form.trigger(FORM_STEPS[step].fields))) return;
    const error = conflict(form.getValues());
    if (error) {
      form.setError(error.field, { message: error.message }, { shouldFocus: true });
      return;
    }
    setStep(step + 1);
  };
  const handlePrev = () => {
    if (step === 0) request(isUpdate ? "close" : "provider");
    else setStep(step - 1);
  };
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else request("close");
        }}
      >
        <FormProvider {...form}>
          <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:sm:max-w-none">
            {type ? (
              <SheetHeader>
                <Inline gap={12} wrap={false} align="start">
                  <ProviderLogo type={type} />
                  <Stack gap={4}>
                    <Inline gap={8}>
                      <SheetTitle>{SECRET_ROTATION_MAP[type].name} secret rotation</SheetTitle>
                      <DocsLink type={type} />
                    </Inline>
                    {!isUpdate && (
                      <SheetDescription>
                        Infisical replaces these credentials on a schedule and writes each new value
                        to the secrets you map.
                      </SheetDescription>
                    )}
                  </Stack>
                </Inline>
              </SheetHeader>
            ) : (
              <SheetHeader>
                <SheetTitle>Choose a rotation provider</SheetTitle>
                <SheetDescription>
                  Pick the service whose credentials Infisical rotates on a schedule.
                </SheetDescription>
              </SheetHeader>
            )}
            {type ? (
              <RotationSteps
                isUpdate={isUpdate}
                type={type}
                step={step}
                onStep={setStep}
                onCancel={() => request("provider")}
                environments={rotationEnvironments}
                project={project}
                addedConnections={addedConnections}
                onCreateConnection={(connection) =>
                  setAddedConnections([...addedConnections, connection])
                }
              />
            ) : (
              <div
                data-scroll-fade="y"
                className="min-h-0 flex-1 overflow-y-auto p-[var(--cipher-space-overlay-inset)]"
              >
                <ProviderSelect onSelect={select} />
              </div>
            )}
            {type && (
              <SheetFooter>
                <Inline justify="between" wrap={false}>
                  <SmallText muted>{isDirty ? "Unsaved changes" : ""}</SmallText>
                  <Inline gap={12} wrap={false}>
                    <SmallText muted>
                      Step {step + (isUpdate ? 1 : 2)} of {FORM_STEPS.length + (isUpdate ? 0 : 1)}
                    </SmallText>
                    <Button variant="outline" onClick={handlePrev}>
                      Back
                    </Button>
                    <Gate reason={isFinalStep ? submitBlock : undefined}>
                      <Button
                        variant="primary"
                        disabled={isFinalStep && Boolean(submitBlock)}
                        onClick={handleNext}
                      >
                        {isFinalStep
                          ? `${isUpdate ? "Update" : "Create"} secret rotation`
                          : "Continue"}
                      </Button>
                    </Gate>
                  </Inline>
                </Inline>
              </SheetFooter>
            )}
          </SheetContent>
        </FormProvider>
      </Sheet>
      <AlertDialog open={discard !== null} onOpenChange={(next) => !next && setDiscard(null)}>
        <AlertDialogContent icon="alert">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isUpdate ? "Discard changes?" : "Discard Secret Rotation Setup?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isUpdate
                ? "Your unsaved changes to this secret rotation will be lost."
                : "Your progress configuring this secret rotation will be lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (discard === "close") close();
                else reset();
                setDiscard(null);
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
