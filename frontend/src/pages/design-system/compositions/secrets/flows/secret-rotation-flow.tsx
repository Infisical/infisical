import { useMemo, useState } from "react";
import { Controller, type FieldValues, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useV4Theme } from "@app/components/v4/scope";
import { Alert } from "@app/components/v4/ui/alert";
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
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FieldError } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Media, Tile } from "@app/components/v4/ui/item";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { Steps } from "@app/components/v4/ui/multi-step";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { Heading, SmallText, Text } from "@app/components/v4/ui/text";

import type { Resource } from "../../secrets-model";
import { ReviewSection, RotationField, TextField, useRotationForm } from "./secret-rotation/fields";
import {
  appConnectionName,
  LOCAL_ROTATION_CONNECTIONS,
  ROTATION_TEMPLATES,
  type RotationConnection,
  type RotationEnvironment
} from "./secret-rotation/model";
import { ROTATION_VIEWS } from "./secret-rotation/registry";
import {
  getSecretRotationConnectionApps,
  IS_ROTATION_DUAL_CREDENTIALS,
  SECRET_ROTATION_MAP,
  SecretRotation,
  SecretRotationV2FormSchema
} from "./secret-rotation/schemas";

export type RotationResource = Extract<Resource, { kind: "rotation" }>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  environments: { value: string; label: string }[];
  environment?: string;
  secretPath: string;
  resources: Resource[];
  onCreate: (resource: RotationResource) => void;
};

const FORM_STEPS = [
  {
    name: "Configuration",
    shortDescription: "Connection and schedule",
    title: "Configure the rotation",
    subtitle: "Choose the connection and decide when Infisical should rotate these credentials.",
    rightDescription:
      "The connection identifies the provider account. The schedule controls how often Infisical replaces its active credentials.",
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
    shortDescription: "Provider settings",
    title: "Set provider parameters",
    subtitle: "Choose the provider resource and configure how its credentials should be rotated.",
    rightDescription:
      "These settings are specific to the selected provider and determine which account or resource Infisical manages.",
    fields: ["parameters", "temporaryParameters"]
  },
  {
    name: "Mappings",
    shortDescription: "Generated secret keys",
    title: "Map generated credentials",
    subtitle: "Choose the Infisical secret keys that will receive each generated credential.",
    rightDescription:
      "Each generated value is written to the mapped secret key in the selected environment and path.",
    fields: ["secretsMapping"]
  },
  {
    name: "Details",
    shortDescription: "Name and description",
    title: "Add rotation details",
    subtitle: "Give this rotation a clear name and an optional description.",
    rightDescription:
      "Use a name that distinguishes this rotation from other provider accounts and environments.",
    fields: ["name", "description"]
  },
  {
    name: "Review",
    shortDescription: "Confirm configuration",
    title: "Review the rotation",
    subtitle: "Confirm the configuration before saving the secret rotation.",
    rightDescription:
      "Verify the connection, schedule, provider parameters, and generated secret mappings before continuing.",
    fields: []
  }
];

const DEFAULT_ROTATION_INTERVAL = 30;
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
  const theme = useV4Theme();
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
                  Rotate {SECRET_ROTATION_MAP[type].name} and write the generated values to
                  Infisical secrets.
                </SmallText>
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
            description={
              search.trim()
                ? "Try a different search term."
                : "No secret rotation providers are available for this instance."
            }
          />
        )}
      </Stack>
    </Stack>
  );
}

function ConfigurationFields({
  environments,
  connections,
  onCreateConnection
}: {
  environments?: RotationEnvironment[];
  connections: RotationConnection[];
  onCreateConnection: (connection: RotationConnection) => void;
}) {
  const { control, setValue } = useRotationForm();
  const [type, isAutoRotationEnabled] = useWatch({
    control,
    name: ["type", "isAutoRotationEnabled"]
  }) as [SecretRotation, boolean];
  const apps = getSecretRotationConnectionApps(type);
  const app = apps[0];
  const available = connections.filter((connection) => apps.includes(connection.app));
  const connectionLabel = apps.length > 1 ? "Connection" : `${appConnectionName(app)} Connection`;
  return (
    <Stack gap={16}>
      {environments && (
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
            tooltip="App Connections can be created from the Organization Settings page."
            error={error?.message ?? error?.root?.message}
            description={
              <>
                Check out{" "}
                <a
                  href={`https://infisical.com/docs/integrations/app-connections/${field.value?.app ?? app}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  our docs
                </a>{" "}
                to ensure your connection has the required permissions for secret rotation.
              </>
            }
          >
            <Combobox
              label={connectionLabel}
              value={field.value?.id ?? ""}
              onValueChange={(id) => field.onChange(available.find((entry) => entry.id === id))}
              options={available.map((connection) => ({
                value: connection.id,
                label: connection.name,
                meta: apps.length > 1 ? appConnectionName(connection.app) : undefined
              }))}
              placeholder="Select connection..."
              invalid={Boolean(error)}
              onCreate={(name) => {
                const connection = { id: crypto.randomUUID(), name, app };
                onCreateConnection(connection);
                setValue("connection", connection, { shouldValidate: true, shouldDirty: true });
              }}
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
            description={
              field.value
                ? "Secrets will automatically be rotated when the rotation interval specified above has elapsed."
                : "Secrets will not be rotated automatically. You can still rotate secrets manually."
            }
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />
      {!IS_ROTATION_DUAL_CREDENTIALS[type] && isAutoRotationEnabled && (
        <Alert tone="warn">
          Due to {SECRET_ROTATION_MAP[type].name} Rotations rotating a single credential set,
          auto-rotation may result in service interruptions. If you need to ensure service
          continuity, we recommend disabling this option.{" "}
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
  type,
  step,
  onStep,
  onCancel,
  environments,
  connections,
  onCreateConnection
}: {
  type: SecretRotation;
  step: number;
  onStep: (step: number) => void;
  onCancel: () => void;
  environments: RotationEnvironment[];
  connections: RotationConnection[];
  onCreateConnection: (connection: RotationConnection) => void;
}) {
  const Views = ROTATION_VIEWS[type];
  const current = FORM_STEPS[step];
  return (
    <div className="flex min-h-0 flex-1 border-y border-[color:var(--v4-line-soft)]">
      <aside className="flex w-60 shrink-0 flex-col gap-5 border-r border-[color:var(--v4-line-soft)] px-5 py-6">
        <SmallText muted>Setup steps</SmallText>
        <Steps
          orientation="vertical"
          label="Setup steps"
          current={step + 1}
          steps={[
            { title: "Provider", summary: SECRET_ROTATION_MAP[type].name },
            ...FORM_STEPS.map((entry) => ({ title: entry.name, summary: entry.shortDescription }))
          ]}
          onStepClick={(index) => {
            if (index === 0) {
              onCancel();
              return;
            }
            if (index - 1 < step) onStep(index - 1);
          }}
        />
      </aside>
      <form
        data-scroll-fade="y"
        className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-6"
        onSubmit={(event) => event.preventDefault()}
      >
        <Stack gap={4}>
          <Heading level={2} size="subsection">
            {current.title}
          </Heading>
          <Text muted>{current.subtitle}</Text>
        </Stack>
        {step === 0 && (
          <ConfigurationFields
            environments={environments}
            connections={connections}
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
      <aside className="hidden w-80 shrink-0 flex-col gap-4 border-l border-[color:var(--v4-line-soft)] px-6 py-6 xl:flex">
        <Inline justify="between" wrap={false}>
          <SmallText muted>
            Step {step + 2}: {current.name}
          </SmallText>
          <DocsLink type={type} />
        </Inline>
        <Stack gap={8}>
          <Text>What this step does</Text>
          <SmallText muted>{current.rightDescription}</SmallText>
        </Stack>
      </aside>
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
  onCreate
}: Props) {
  const [type, setType] = useState<SecretRotation | null>(null);
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string>();
  const [discard, setDiscard] = useState<"close" | "provider" | null>(null);
  const [connections, setConnections] = useState(LOCAL_ROTATION_CONNECTIONS);
  const form = useForm<FieldValues>({
    resolver: zodResolver(SecretRotationV2FormSchema(false)),
    mode: "onChange",
    reValidateMode: "onChange"
  });
  const { isDirty } = form.formState;
  const rotationEnvironments = environments.map((entry) => ({
    id: entry.value,
    slug: entry.value,
    name: entry.label
  }));
  const select = (next: SecretRotation) => {
    form.reset(
      defaultsFor(
        next,
        secretPath,
        rotationEnvironments.find((entry) => entry.slug === environment)
      )
    );
    setStep(0);
    setSubmitError(undefined);
    setType(next);
  };
  const reset = () => {
    setType(null);
    setSubmitError(undefined);
  };
  const close = () => {
    reset();
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
    const keys = Object.values(values.secretsMapping as Record<string, string>);
    const scoped = resources.filter(
      (entry) => entry.project === project && entry.environment === env.slug && entry.path === path
    );
    if (scoped.some((entry) => entry.kind === "rotation" && entry.name === values.name))
      return `A Secret Rotation with the name "${values.name}" already exists at the secret path "${path}"`;
    if (new Set(keys).size !== keys.length)
      return `Secrets mapping keys must be unique. "${keys.join(", ")}" contains duplicate keys.`;
    const conflicts = scoped.filter(
      (entry) => entry.kind === "secret" && keys.includes(entry.name)
    );
    if (conflicts.length)
      return `The following secrets already exist at the path "${path}": ${conflicts.map((entry) => entry.name).join(", ")}`;
    return undefined;
  };
  const submit = (values: FieldValues) => {
    const error = conflict(values);
    if (error) {
      setSubmitError(error);
      return;
    }
    const env = values.environment as RotationEnvironment;
    const now = new Date();
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + Number(values.rotationInterval));
    next.setUTCHours(values.rotateAtUtc.hours, values.rotateAtUtc.minutes, 0, 0);
    onCreate({
      kind: "rotation",
      id: `${project}:${env.slug}:${values.secretPath}:rotation:${values.name}`,
      project,
      environment: env.slug,
      path: values.secretPath,
      name: values.name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      provider: SECRET_ROTATION_MAP[values.type as SecretRotation].name,
      connection: values.connection.name,
      status: "success",
      autoRotation: values.isAutoRotationEnabled,
      description: values.description || undefined,
      lastRotatedAt: now.toISOString(),
      nextRotationAt: values.isAutoRotationEnabled ? next.toISOString() : undefined,
      managedKeys: Object.values(values.secretsMapping as Record<string, string>)
    });
    close();
  };
  const isFinalStep = step === FORM_STEPS.length - 1;
  const handleNext = async () => {
    setSubmitError(undefined);
    if (isFinalStep) {
      await form.handleSubmit(submit)();
      return;
    }
    if (await form.trigger(FORM_STEPS[step].fields)) setStep(step + 1);
  };
  const handlePrev = () => {
    setSubmitError(undefined);
    if (step === 0) request("provider");
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
                    <SheetDescription>
                      Configure how Infisical rotates {SECRET_ROTATION_MAP[type].name}.
                    </SheetDescription>
                  </Stack>
                </Inline>
              </SheetHeader>
            ) : (
              <SheetHeader>
                <SheetTitle>Choose a rotation provider</SheetTitle>
                <SheetDescription>
                  Select the provider whose credentials Infisical should rotate.
                </SheetDescription>
              </SheetHeader>
            )}
            {type ? (
              <RotationSteps
                type={type}
                step={step}
                onStep={setStep}
                onCancel={() => request("provider")}
                environments={rotationEnvironments}
                connections={connections}
                onCreateConnection={(connection) => setConnections([...connections, connection])}
              />
            ) : (
              <div
                data-scroll-fade="y"
                className="min-h-0 flex-1 overflow-y-auto border-t border-[color:var(--v4-line-soft)] p-[var(--v4-space-overlay-inset)]"
              >
                <ProviderSelect onSelect={select} />
              </div>
            )}
            {type && (
              <SheetFooter>
                <Inline justify="between" wrap={false}>
                  {submitError ? (
                    <FieldError>{submitError}</FieldError>
                  ) : (
                    <SmallText muted>{isDirty ? "Unsaved changes" : ""}</SmallText>
                  )}
                  <Inline gap={12} wrap={false}>
                    <SmallText muted>
                      Step {step + 2} of {FORM_STEPS.length + 1}
                    </SmallText>
                    <Button variant="outline" onClick={handlePrev}>
                      Back
                    </Button>
                    <Button variant="primary" onClick={handleNext}>
                      {isFinalStep ? "Create secret rotation" : "Continue"}
                    </Button>
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
            <AlertDialogTitle>Discard Secret Rotation Setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress configuring this secret rotation will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
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
