import { type ReactNode, useState } from "react";
import {
  Controller,
  type FieldValues,
  FormProvider,
  useForm,
  useFormContext,
  useWatch
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { ArrowRightIcon } from "lucide-react";

import {
  getSecretSyncDestinationConfig,
  SecretSyncFormSchema
} from "@app/components/secret-syncs/forms/schemas";
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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FieldError } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Tile } from "@app/components/v4/ui/item";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { RadioGroup, RadioGroupItem } from "@app/components/v4/ui/radio-group";
import { Switch } from "@app/components/v4/ui/switch";
import { SmallText } from "@app/components/v4/ui/text";
import {
  POPULAR_SECRET_SYNCS,
  SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP,
  SECRET_SYNC_MAP
} from "@app/helpers/secretSyncs";
import { SecretSync, SecretSyncInitialSyncBehavior } from "@app/hooks/api/secretSyncs/enums";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";
import { getSecretSyncDestinationColValues } from "@app/pages/secret-manager/IntegrationsListPage/components/SecretSyncsTab/SecretSyncTable/helpers";

import type { Resource } from "../../secrets-model";
import type { FlowFeedback, FlowScope } from "../flows";
import {
  ReviewSection,
  RotationField as SyncField,
  TextField
} from "../flows/secret-rotation/fields";
import { DiscardDialog, Gate, LOCAL_ONLY } from "../flows/shared";
import { ProviderLogo, WizardSheet } from "../flows/wizard-sheet";
import { NEXT_PHASE } from "../overview-cells";
import type { RowActionTone } from "../row-actions/types";
import { SYNC_VIEWS, SyncConnections } from "./destination-fields";
import {
  IMPORT_CAPABLE_SYNCS,
  LOCAL_SYNC_CONNECTIONS,
  type LocalSecretSync,
  PORTED_SYNCS
} from "./sync-model";

import flowStyles from "../flows/flows.module.css";
import styles from "./secret-sync.module.css";

type SyncEnvironment = { slug: string; id: string; name: string };

const DOCS = "https://infisical.com/docs/integrations/secret-syncs";

const formTabs = (destination: SecretSync, destinationName: string) => [
  {
    name: "Source",
    key: "source",
    shortDescription: "Pick env and path",
    title: "Source secrets",
    subtitle: "Pick the Infisical environment and path to sync from.",
    rightDescription:
      "Choose what gets synced. The environment and path together define the set of secrets this sync will push out.",
    fields:
      destination === SecretSync.AzureEntraIdScim
        ? ["secretPath", "environment", "syncOptions"]
        : ["secretPath", "environment"]
  },
  {
    name: "Destination",
    key: "destination",
    shortDescription: "Connect provider",
    title: `Connect to ${destinationName}`,
    subtitle: "Choose a connection and configure the target location.",
    rightDescription: `Tell Infisical where to write. Pick a ${destinationName} connection and the exact destination, like a workspace, project, namespace, or whatever this provider expects.`,
    fields: ["connection", "destinationConfig"]
  },
  {
    name: "Initial sync",
    key: "initialSync",
    shortDescription: "How to resolve the first run",
    title: "Initial sync behavior",
    subtitle: `Choose how Infisical should reconcile existing secrets in ${destinationName} the first time this sync runs.`,
    rightDescription:
      "The first run is special. Infisical can either overwrite everything in the destination or import existing secrets back into Infisical. Subsequent runs follow your sync options.",
    fields: ["syncOptions"]
  },
  {
    name: "Sync options",
    key: "options",
    shortDescription: "Behavior and advanced",
    title: "Sync options",
    subtitle: "Control how secrets are written and whether they sync automatically.",
    rightDescription:
      "Decide how Infisical reconciles changes on every run, including auto-sync, key schema, and how conflicts are handled.",
    fields: ["syncOptions"]
  },
  {
    name: "Details",
    key: "details",
    shortDescription: "Name and description",
    title: "Sync details",
    subtitle: "Give this sync a name and an optional description.",
    rightDescription:
      "A clear name helps when you have multiple syncs. The description shows up in the sync list as a tooltip.",
    fields: ["name", "description"]
  },
  {
    name: "Review",
    key: "review",
    shortDescription: "Confirm",
    title: "Review and create",
    subtitle: "Double-check everything before creating the sync.",
    rightDescription:
      "Verify your configuration before creating the sync. You can edit these settings later if needed.",
    fields: [] as string[]
  }
];

const canImport = (destination: SecretSync) => IMPORT_CAPABLE_SYNCS.includes(destination);

const nameOf = (destination: SecretSync) => SECRET_SYNC_MAP[destination].name;

function ProviderPicker({ onSelect }: { onSelect: (destination: SecretSync) => void }) {
  const [search, setSearch] = useState("");
  const all = (Object.values(SecretSync) as SecretSync[])
    .filter((destination) => SECRET_SYNC_MAP[destination])
    .sort((first, second) => nameOf(first).localeCompare(nameOf(second)));
  const query = search.trim().toLowerCase();
  const filtered = all.filter((destination) => {
    const entry = SECRET_SYNC_MAP[destination];
    return [entry.name, entry.category, destination, ...(entry.aliases ?? [])].some((value) =>
      value.toLowerCase().includes(query)
    );
  });
  const card = (destination: SecretSync) => {
    const { name, image, category, description } = SECRET_SYNC_MAP[destination];
    const ported = PORTED_SYNCS.includes(destination);
    return (
      <Gate key={destination} reason={ported ? undefined : NEXT_PHASE}>
        <Tile
          media={<ProviderLogo image={image} size={24} />}
          title={name}
          description={<span className={styles.tileText}>{description}</span>}
          disabled={!ported}
          onClick={() => onSelect(destination)}
        >
          <span className={styles.category}>{category}</span>
        </Tile>
      </Gate>
    );
  };
  const grid = (destinations: SecretSync[]) => (
    <Grid columns={3} gap={12}>
      {destinations.map(card)}
    </Grid>
  );
  return (
    <Stack gap={24}>
      <Input
        icon="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search providers like AWS, Vercel, GitHub Actions, Vault..."
        aria-label="Search secret sync providers"
      />
      {query && filtered.length > 0 && grid(filtered)}
      {query && !filtered.length && (
        <EmptyState
          icon="search"
          title="No matching providers"
          description="Try a different search term."
        />
      )}
      {!query && (
        <>
          <section className={styles.pickerSection}>
            <span className={flowStyles.eyebrow}>Popular</span>
            {grid(POPULAR_SECRET_SYNCS)}
          </section>
          <section className={styles.pickerSection}>
            <span className={flowStyles.eyebrow}>All providers</span>
            {grid(all)}
          </section>
        </>
      )}
    </Stack>
  );
}

const useSyncValues = () => useWatch() as FieldValues;
const useSyncFormContext = () => useFormContext<FieldValues>();

const recursiveConflicts = (
  resources: readonly Resource[] | undefined,
  project: string,
  environment: string | undefined,
  secretPath: string | undefined,
  includeAllSubFolders: boolean
) => {
  if (!resources || !includeAllSubFolders || !environment || !secretPath) return [];
  const base = secretPath === "/" ? "/" : secretPath.replace(/\/+$/, "");
  const prefix = base === "/" ? "/" : `${base}/`;
  const byKey = new Map<string, Set<string>>();
  resources.forEach((resource) => {
    if (
      resource.kind !== "secret" ||
      resource.project !== project ||
      resource.environment !== environment ||
      !(resource.path === base || resource.path.startsWith(prefix))
    )
      return;
    byKey.set(resource.name, (byKey.get(resource.name) ?? new Set()).add(resource.path));
  });
  return [...byKey]
    .filter(([, paths]) => paths.size > 1)
    .map(([key, paths]) => ({ key, paths: [...paths].sort() }));
};

const MAX_DISPLAYED_CONFLICTS = 5;

function IncludeSubfoldersSwitch({
  checked,
  onChange
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { setValue } = useSyncFormContext();
  return (
    <Switch
      layout="row"
      label="Include secrets from all subfolders"
      description="Also sync secrets from every folder beneath this path, however deep. Secret names must be unique across all of them."
      checked={checked}
      onCheckedChange={(next) => {
        onChange(next);
        if (next)
          setValue(
            "syncOptions.initialSyncBehavior",
            SecretSyncInitialSyncBehavior.OverwriteDestination
          );
      }}
    />
  );
}

function SourceFields({
  environments,
  conflicts
}: {
  environments: SyncEnvironment[];
  conflicts: { key: string; paths: string[] }[];
}) {
  const { destination, syncOptions } = useSyncValues();
  return (
    <Stack gap={16}>
      <Controller
        name="environment"
        render={({ field, fieldState: { error } }) => (
          <SyncField label="Environment" error={error?.message}>
            <Combobox
              label="Environment"
              value={field.value?.slug ?? ""}
              onValueChange={(slug) =>
                field.onChange(environments.find((environment) => environment.slug === slug))
              }
              options={environments.map((environment) => ({
                value: environment.slug,
                label: environment.name
              }))}
              placeholder="Select environment..."
              invalid={Boolean(error)}
            />
          </SyncField>
        )}
      />
      <TextField name="secretPath" label="Secret path" placeholder="/" />
      <Controller
        name="syncOptions.includeAllSubFolders"
        render={({ field }) => (
          <Stack gap={12}>
            <IncludeSubfoldersSwitch checked={Boolean(field.value)} onChange={field.onChange} />
            {Boolean(field.value) && canImport(destination) && (
              <Alert tone="warn" title="Initial sync is set to overwrite the destination">
                A sync that includes subfolders cannot import secrets from the destination into
                Infisical, because there is no single folder to import them into.
              </Alert>
            )}
            {Boolean(syncOptions?.includeAllSubFolders) && conflicts.length > 0 && (
              <Alert
                tone="bad"
                title={
                  conflicts.length === 1
                    ? "1 secret name conflicts across folders"
                    : `${conflicts.length} secret names conflict across folders`
                }
              >
                <Stack gap={8}>
                  <span>
                    This destination stores secrets in a single flat list, so each name can be used
                    only once. Rename or move one secret in each pair, or point the sync at a
                    narrower secret path.
                  </span>
                  {conflicts.slice(0, MAX_DISPLAYED_CONFLICTS).map((conflict) => (
                    <span key={conflict.key}>
                      <code>&quot;{conflict.key}&quot;</code> is used in {conflict.paths.length}{" "}
                      folders:
                      <ul className={styles.conflictList}>
                        {conflict.paths.map((path) => (
                          <li key={path}>
                            <code>{path}</code>
                          </li>
                        ))}
                      </ul>
                    </span>
                  ))}
                  {conflicts.length > MAX_DISPLAYED_CONFLICTS && (
                    <span>and {conflicts.length - MAX_DISPLAYED_CONFLICTS} more</span>
                  )}
                </Stack>
              </Alert>
            )}
          </Stack>
        )}
      />
    </Stack>
  );
}

type Fate = "added" | "removed" | "updated" | "imported";
type DiagramRow = { name: string; fate?: Fate };
type Variant = "overwrite" | "prioritize-infisical" | "prioritize-destination";

const FATE_LABEL: Record<Fate, string> = {
  added: "added",
  updated: "updated",
  imported: "imported",
  removed: "removed"
};
const BEFORE_INFISICAL: DiagramRow[] = [{ name: "API_KEY" }, { name: "DB_URL" }];
const BEFORE_DESTINATION: DiagramRow[] = [{ name: "API_KEY" }, { name: "LEGACY_TOKEN" }];
const AFTER: Record<Variant, { infisical: DiagramRow[]; destination: DiagramRow[] }> = {
  overwrite: {
    infisical: [{ name: "API_KEY" }, { name: "DB_URL" }],
    destination: [
      { name: "API_KEY", fate: "updated" },
      { name: "DB_URL", fate: "added" },
      { name: "LEGACY_TOKEN", fate: "removed" }
    ]
  },
  "prioritize-infisical": {
    infisical: [
      { name: "API_KEY" },
      { name: "DB_URL" },
      { name: "LEGACY_TOKEN", fate: "imported" }
    ],
    destination: [
      { name: "API_KEY", fate: "updated" },
      { name: "DB_URL", fate: "added" },
      { name: "LEGACY_TOKEN" }
    ]
  },
  "prioritize-destination": {
    infisical: [
      { name: "API_KEY", fate: "updated" },
      { name: "DB_URL" },
      { name: "LEGACY_TOKEN", fate: "imported" }
    ],
    destination: [{ name: "API_KEY" }, { name: "DB_URL", fate: "added" }, { name: "LEGACY_TOKEN" }]
  }
};

const variantOf = (behavior: string): Variant => {
  if (behavior === SecretSyncInitialSyncBehavior.OverwriteDestination) return "overwrite";
  if (behavior === SecretSyncInitialSyncBehavior.ImportPrioritizeSource)
    return "prioritize-infisical";
  return "prioritize-destination";
};

function DiagramColumn({ label, rows }: { label: string; rows: DiagramRow[] }) {
  return (
    <div className={styles.diagramColumn}>
      <span className={flowStyles.eyebrow}>{label}</span>
      {rows.map((row) => (
        <div key={row.name} className={styles.diagramRow} data-fate={row.fate}>
          <span>{row.name}</span>
          {row.fate && (
            <span className={styles.fate} data-fate={row.fate}>
              {FATE_LABEL[row.fate]}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function DiagramSection({
  title,
  subtitle,
  destinationName,
  infisical,
  destination
}: {
  title: string;
  subtitle: string;
  destinationName: string;
  infisical: DiagramRow[];
  destination: DiagramRow[];
}) {
  return (
    <div className={styles.diagramSection}>
      <div className={styles.diagramHead}>
        <span className={flowStyles.label}>{title}</span>
        <SmallText muted>{subtitle}</SmallText>
      </div>
      <div className={styles.diagramColumns}>
        <DiagramColumn label="Infisical" rows={infisical} />
        <DiagramColumn label={destinationName} rows={destination} />
      </div>
    </div>
  );
}

function ReconciliationDiagram({
  variant,
  destinationName
}: {
  variant: Variant;
  destinationName: string;
}) {
  return (
    <div className={styles.diagram} aria-hidden="true">
      <DiagramSection
        title="Before"
        subtitle="The secrets currently on each side, before the first sync runs"
        destinationName={destinationName}
        infisical={BEFORE_INFISICAL}
        destination={BEFORE_DESTINATION}
      />
      <div className={styles.diagramDivider}>
        <Icon name="arrow-down" size="var(--v4-size-icon-xs)" />
        <span className={flowStyles.eyebrow}>First sync runs</span>
      </div>
      <DiagramSection
        title="After"
        subtitle="How each side looks once the first sync completes"
        destinationName={destinationName}
        infisical={AFTER[variant].infisical}
        destination={AFTER[variant].destination}
      />
      <div className={styles.legend}>
        {(
          [
            [undefined, "unchanged"],
            ["updated", "value updated"],
            ["added", "added"],
            ["imported", "imported"],
            ["removed", "removed"]
          ] as const
        ).map(([fate, label]) => (
          <span key={label} className={styles.legendItem}>
            <span className={styles.swatch} data-fate={fate} />
            <span className={flowStyles.eyebrow}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const shortNameOf = (name: string) =>
  name.startsWith("Digital Ocean") ? "Digital Ocean" : name.split(" ")[0];

const behaviorCopy = (key: SecretSyncInitialSyncBehavior, destinationName: string) => {
  const shortName = shortNameOf(destinationName);
  if (key === SecretSyncInitialSyncBehavior.OverwriteDestination)
    return {
      title: `Overwrite ${destinationName}`,
      description: `On the initial sync, Infisical will write its secrets to ${destinationName}. No secrets will be imported from ${shortName}. Depending on your configuration this can lead to removal of secrets from ${shortName}.`
    };
  if (key === SecretSyncInitialSyncBehavior.ImportPrioritizeSource)
    return {
      title: `Import from ${shortName}, prioritize Infisical`,
      description: `Prior to the initial sync, Infisical will import secrets from ${destinationName}. If an imported secret already exists in Infisical, the imported secret value is ignored, preserving the Infisical value.`
    };
  return {
    title: `Import from ${shortName}, prioritize ${shortName}`,
    description: `Prior to the initial sync, Infisical will import secrets from ${destinationName}. If an imported secret already exists in Infisical, the imported secret value will overwrite the existing value in Infisical.`
  };
};

const BEHAVIOR_ORDER = [
  SecretSyncInitialSyncBehavior.OverwriteDestination,
  SecretSyncInitialSyncBehavior.ImportPrioritizeSource,
  SecretSyncInitialSyncBehavior.ImportPrioritizeDestination
];

const isVercelSensitive = (values: FieldValues) =>
  values.destination === SecretSync.Vercel && Boolean(values.destinationConfig?.sensitive);

function InitialSyncAlerts({
  onGoToInitialSync,
  onGoToOptions
}: {
  onGoToInitialSync?: () => void;
  onGoToOptions?: () => void;
}) {
  const values = useSyncValues();
  const { syncOptions } = values;
  if (
    isVercelSensitive(values) ||
    syncOptions?.initialSyncBehavior !== SecretSyncInitialSyncBehavior.OverwriteDestination ||
    syncOptions?.disableSecretDeletion ||
    syncOptions?.keySchema
  )
    return null;
  const remedy = (text: string, onClick?: () => void) =>
    onClick ? (
      <Button type="button" variant="link" size="xs" onClick={onClick}>
        {text}
      </Button>
    ) : (
      text
    );
  return (
    <Alert tone="warn" title="External secrets will be deleted">
      Anything in {nameOf(values.destination)} not in Infisical will be removed. To keep them,{" "}
      {remedy("import from provider", onGoToInitialSync)},{" "}
      {remedy("customize key names", onGoToOptions)}, or{" "}
      {remedy("prevent secret deletion", onGoToOptions)}.
    </Alert>
  );
}

function InitialSyncFields() {
  const values = useSyncValues();
  const destination = values.destination as SecretSync;
  const destinationName = nameOf(destination);
  const vercelSensitive = isVercelSensitive(values);
  const includeAllSubFolders = Boolean(values.syncOptions?.includeAllSubFolders);
  const importable = canImport(destination);
  const current = values.syncOptions?.initialSyncBehavior;
  const keys =
    importable && !vercelSensitive && !includeAllSubFolders
      ? BEHAVIOR_ORDER
      : [SecretSyncInitialSyncBehavior.OverwriteDestination];
  return (
    <Stack gap={16}>
      {includeAllSubFolders && importable && (
        <Alert tone="info" title="Importing secrets is not supported with subfolders">
          This sync includes secrets from subfolders, so there is no single folder to import
          destination secrets into. Turn off subfolders on the source step to import instead.
        </Alert>
      )}
      {!vercelSensitive && !includeAllSubFolders && !importable && (
        <Alert tone="warn" title="Importing secrets is not supported">
          {destinationName} only supports overwrite.
          {!values.syncOptions?.disableSecretDeletion &&
            !values.syncOptions?.keySchema &&
            " Secrets not in Infisical will be removed. Add a key schema or prevent secret deletion to keep them."}
        </Alert>
      )}
      {vercelSensitive && (
        <Alert tone="warn" title="Overwrite only">
          Vercel can&apos;t read sensitive secrets back, so Infisical must overwrite the
          destination.
        </Alert>
      )}
      {destination === SecretSync.Vercel &&
        !vercelSensitive &&
        current !== SecretSyncInitialSyncBehavior.OverwriteDestination && (
          <Alert tone="warn" title="Limited import for team-scoped syncs">
            Only Vercel shared environment variables whose scope exactly matches this sync&apos;s
            configuration (target environments, target projects, and Apply to all Custom
            Environments) will be imported. Variables covering a broader scope, or split across
            separate records per environment, will not be imported on the initial sync.
          </Alert>
        )}
      <Controller
        name="syncOptions.initialSyncBehavior"
        render={({ field, fieldState: { error } }) => (
          <Stack gap={16}>
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              className={styles.choiceGroup}
              aria-label="Initial sync behavior"
            >
              {keys.map((key) => {
                const { title, description } = behaviorCopy(key, destinationName);
                const id = `initial-sync-${key}`;
                return (
                  <label key={key} htmlFor={id} className={styles.choice}>
                    <span className={styles.choiceText}>
                      <span className={styles.choiceTitle}>{title}</span>
                      <span className={styles.choiceDescription}>{description}</span>
                    </span>
                    <RadioGroupItem
                      value={key}
                      id={id}
                      aria-invalid={Boolean(error) || undefined}
                    />
                  </label>
                );
              })}
            </RadioGroup>
            {field.value && (
              <Stack gap={8}>
                <span className={flowStyles.eyebrow}>Example</span>
                <ReconciliationDiagram
                  variant={variantOf(field.value)}
                  destinationName={destinationName}
                />
              </Stack>
            )}
            {error?.message && <FieldError>{error.message}</FieldError>}
          </Stack>
        )}
      />
    </Stack>
  );
}

const SAMPLE_KEY = "API_KEY";

function KeySchemaField({ destinationName }: { destinationName: string }) {
  const { setValue, getValues, formState } = useSyncFormContext();
  const hasError = Boolean(
    (formState.errors.syncOptions as Record<string, unknown> | undefined)?.keySchema
  );
  const [enabled, setEnabled] = useState(Boolean(getValues("syncOptions.keySchema")));
  const preview = (schema?: string) =>
    (schema || SAMPLE_KEY)
      .replaceAll("{{secretKey}}", SAMPLE_KEY)
      .replaceAll("{{environment}}", "prod") || SAMPLE_KEY;
  return (
    <Stack gap={16}>
      <Switch
        layout="row"
        label="Customize key names"
        description={`Add a prefix or suffix so Infisical can identify which keys in ${destinationName} it manages. Anything else is left untouched.`}
        checked={enabled || hasError}
        onCheckedChange={(checked) => {
          setEnabled(checked);
          if (!checked)
            setValue("syncOptions.keySchema", undefined, {
              shouldValidate: true,
              shouldDirty: true
            });
        }}
      />
      {(enabled || hasError) && (
        <Controller
          name="syncOptions.keySchema"
          render={({ field, fieldState: { error } }) => (
            <Stack gap={12}>
              <SyncField
                label="Key schema"
                error={error?.message}
                description={
                  <>
                    Provide a template to rewrite each key. Use <code>{"{{secretKey}}"}</code> as a
                    placeholder, and optionally include <code>{"{{environment}}"}</code>.{" "}
                    <a
                      href={`${DOCS}/overview#key-schemas`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Learn more
                    </a>
                    .
                  </>
                }
              >
                <Input
                  ref={field.ref}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="INFISICAL_{{secretKey}}"
                  mono
                  autoComplete="off"
                />
              </SyncField>
              <div className={styles.keyPreview} aria-hidden="true">
                <DiagramColumn label="Infisical" rows={[{ name: SAMPLE_KEY }]} />
                <span className={styles.keyPreviewArrow}>
                  <Icon icon={ArrowRightIcon} size="var(--v4-size-icon-xs)" />
                </span>
                <DiagramColumn label={destinationName} rows={[{ name: preview(field.value) }]} />
              </div>
            </Stack>
          )}
        />
      )}
    </Stack>
  );
}

function OptionsFields() {
  const { destination } = useSyncValues();
  const destinationName = nameOf(destination);
  const [confirmAllowDeletion, setConfirmAllowDeletion] = useState<(value: boolean) => void>();
  const Extra = SYNC_VIEWS[destination as SecretSync]?.Options;
  return (
    <Stack gap={16}>
      <Controller
        name="syncOptions.disableSecretDeletion"
        render={({ field }) => (
          <Switch
            ref={field.ref}
            layout="row"
            label="Prevent secret deletion"
            description={`Infisical will add and update secrets in ${destinationName} but never delete them. Turn this off to let syncs remove any secrets in ${destinationName} that are not in Infisical.`}
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => {
              if (checked) field.onChange(true);
              else setConfirmAllowDeletion(() => field.onChange);
            }}
          />
        )}
      />
      <Controller
        name="isAutoSyncEnabled"
        render={({ field }) => (
          <Switch
            ref={field.ref}
            layout="row"
            label="Auto-sync on changes"
            description={`When secrets in the source change, sync to ${destinationName} automatically. Turn off to only sync manually.`}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />
      <KeySchemaField destinationName={destinationName} />
      {Extra && <Extra />}
      <AlertDialog
        open={Boolean(confirmAllowDeletion)}
        onOpenChange={(open) => !open && setConfirmAllowDeletion(undefined)}
      >
        <AlertDialogContent icon="alert">
          <AlertDialogHeader>
            <AlertDialogTitle>Allow secret deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Turning off &quot;Prevent secret deletion&quot; lets a sync delete secrets in{" "}
              {destinationName} that are not managed by Infisical.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep protection on</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmAllowDeletion?.(false);
                setConfirmAllowDeletion(undefined);
              }}
            >
              Allow deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
}

const suggestedNameOf = (values: FieldValues) => {
  const destination = values.destination as SecretSync;
  const config = getSecretSyncDestinationConfig(destination, values.destinationConfig);
  let label = "";
  if (config) {
    try {
      label = getSecretSyncDestinationColValues({
        destination,
        destinationConfig: config,
        connection: values.connection
      } as TSecretSync).primaryText;
    } catch {
      label = "";
    }
  }
  const environmentSlug = values.environment?.slug
    ? slugify(values.environment.slug, { lowercase: true, decamelize: false })
    : "";
  const prefix = slugify(`${nameOf(destination)} ${label}`, { lowercase: true, decamelize: false })
    .slice(0, environmentSlug ? Math.max(0, 63 - environmentSlug.length) : 64)
    .replace(/-+$/, "");
  return [prefix, environmentSlug].filter(Boolean).join("-");
};

function DetailsFields() {
  const { setValue, getValues } = useSyncFormContext();
  const suggested = suggestedNameOf(getValues());
  return (
    <Stack gap={16}>
      <Controller
        name="name"
        render={({ field, fieldState: { error } }) => (
          <SyncField
            label="Name"
            error={error?.message}
            description={
              <>
                Must be slug-friendly.{" "}
                {suggested && !field.value && (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() =>
                      setValue("name", suggested, { shouldValidate: true, shouldDirty: true })
                    }
                  >
                    Use {suggested}
                  </Button>
                )}
              </>
            }
          >
            <Input
              ref={field.ref}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={suggested}
              autoFocus
              autoComplete="off"
            />
          </SyncField>
        )}
      />
      <TextField
        name="description"
        label="Description"
        optional
        placeholder="Describe the purpose of this sync..."
        multiline
        rows={4}
      />
    </Stack>
  );
}

const enabledBadge = (enabled: unknown) => (
  <Badge tone={enabled ? "ok" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
);

function ReviewFields({ duplicateProject }: { duplicateProject?: string }) {
  const values = useSyncValues();
  const destination = values.destination as SecretSync;
  const view = SYNC_VIEWS[destination];
  const options = values.syncOptions ?? {};
  return (
    <Stack gap={24}>
      <ReviewSection
        label="Source"
        items={[
          ["Environment", values.environment?.name],
          ["Secret path", values.secretPath]
        ]}
      />
      <Stack gap={12}>
        {duplicateProject !== undefined && (
          <Alert tone="warn" title="Duplicate destination detected">
            <Stack gap={8}>
              <span>
                Another secret sync in your organization is already configured with the same
                destination. This may lead to conflicts or unexpected behavior.
              </span>
              <span>
                Duplicate found in project <code>{duplicateProject}</code>.
              </span>
            </Stack>
          </Alert>
        )}
        <ReviewSection
          label="Destination"
          items={[
            ["Connection", values.connection?.name],
            ...(view?.destinationReview(values.destinationConfig ?? {}) ?? [])
          ]}
        />
      </Stack>
      <ReviewSection
        label="Sync options"
        items={[
          ["Auto-sync", enabledBadge(values.isAutoSyncEnabled)],
          [
            "Initial sync behavior",
            options.initialSyncBehavior &&
              SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[
                options.initialSyncBehavior as SecretSyncInitialSyncBehavior
              ](nameOf(destination)).name
          ],
          ["Key schema", options.keySchema],
          ...(view?.optionsReview?.(options) ?? []),
          ["Include all subfolders", enabledBadge(options.includeAllSubFolders)],
          ["Secret deletion protection", enabledBadge(options.disableSecretDeletion)]
        ]}
      />
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

const mergeDefaults = (base: FieldValues, extra: FieldValues): FieldValues => ({
  ...base,
  ...extra,
  destinationConfig: { ...base.destinationConfig, ...extra.destinationConfig },
  syncOptions: { ...base.syncOptions, ...extra.syncOptions }
});

const sameConfig = (destination: SecretSync, first: unknown, second: unknown) =>
  JSON.stringify(getSecretSyncDestinationConfig(destination, first) ?? null) ===
  JSON.stringify(getSecretSyncDestinationConfig(destination, second) ?? null);

export function CreateSecretSyncSheet({
  open,
  onOpenChange,
  scope,
  initial,
  syncs,
  resources,
  onCreate,
  onToast
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: FlowScope;
  initial?: { environment: string; path: string };
  syncs: readonly LocalSecretSync[];
  resources?: readonly Resource[];
  onCreate: (sync: LocalSecretSync, feedback: FlowFeedback) => void;
  onToast: (tone: RowActionTone, feedback: FlowFeedback) => void;
}) {
  const environments: SyncEnvironment[] = scope.environments.map((environment) => ({
    slug: environment.value,
    id: environment.value,
    name: environment.label
  }));
  const [destination, setDestination] = useState<SecretSync | null>(null);
  const [step, setStep] = useState(0);
  const [discard, setDiscard] = useState<"close" | "provider">();
  const [confirming, setConfirming] = useState(false);
  const [connections, setConnections] = useState(LOCAL_SYNC_CONNECTIONS);
  const form = useForm<FieldValues>({
    resolver: zodResolver(SecretSyncFormSchema),
    mode: "onChange",
    reValidateMode: "onChange"
  });
  const values = useWatch({ control: form.control }) as FieldValues;
  const { isDirty } = form.formState;

  const destinationName = destination ? nameOf(destination) : "";
  const tabs = destination ? formTabs(destination, destinationName) : [];
  const current = tabs[step];
  const isFinalStep = step === tabs.length - 1;
  const conflicts = recursiveConflicts(
    resources,
    scope.project,
    values.environment?.slug,
    values.secretPath,
    Boolean(values.syncOptions?.includeAllSubFolders)
  );
  const duplicate =
    destination && values.connection?.id
      ? syncs.find(
          (sync) =>
            sync.destination === destination &&
            sync.connectionId === values.connection.id &&
            sync.destinationConfig &&
            sameConfig(destination, sync.destinationConfig, values.destinationConfig)
        )
      : undefined;

  const select = (next: SecretSync) => {
    const environment =
      environments.find((entry) => entry.slug === initial?.environment) ?? environments[0];
    form.reset(
      mergeDefaults(
        {
          destination: next,
          isAutoSyncEnabled: true,
          environment,
          secretPath: initial?.path ?? "/",
          syncOptions: {
            initialSyncBehavior: canImport(next)
              ? SecretSyncInitialSyncBehavior.ImportPrioritizeSource
              : SecretSyncInitialSyncBehavior.OverwriteDestination,
            disableSecretDeletion: true
          }
        },
        SYNC_VIEWS[next]?.defaults ?? {}
      )
    );
    setStep(0);
    setDestination(next);
  };
  const close = () => {
    setDestination(null);
    setStep(0);
    setConfirming(false);
    onOpenChange(false);
  };
  const request = (target: "close" | "provider") => {
    if (destination && isDirty) {
      setDiscard(target);
      return;
    }
    if (target === "close") close();
    else setDestination(null);
  };
  const isStepValid = (index: number) => form.trigger(tabs[index].fields);
  const handleNext = async () => {
    if (isFinalStep) {
      setConfirming(true);
      return;
    }
    if (step === 0 && conflicts.length) return;
    if (await isStepValid(step)) setStep(step + 1);
  };
  const handleStepClick = async (index: number) => {
    if (index === 0) {
      request("provider");
      return;
    }
    const target = index - 1;
    if (target === step) return;
    if (target < step) {
      setStep(target);
      return;
    }
    if (conflicts.length) return;
    for (let i = step; i < target; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isStepValid(i))) return;
    }
    setStep(target);
  };
  const submit = (data: FieldValues) => {
    setConfirming(false);
    if (!destination) return;
    if (syncs.some((sync) => sync.project === scope.project && sync.name === data.name)) {
      onToast("bad", {
        title: "Failed to create secret sync",
        description: `A secret sync with the name "${data.name}" already exists in this project.`
      });
      return;
    }
    const environment = data.environment as SyncEnvironment;
    onCreate(
      {
        id: `${scope.project}:${environment.slug}:${data.secretPath}:sync:${data.name}`,
        name: data.name,
        description: data.description || undefined,
        destination,
        project: scope.project,
        environment: environment.slug,
        path: data.secretPath,
        status: null,
        autoSync: data.isAutoSyncEnabled,
        connectionId: data.connection.id,
        connectionName: data.connection.name,
        destinationConfig: data.destinationConfig,
        syncOptions: data.syncOptions
      },
      {
        title: `Successfully added ${destinationName} sync`,
        description: `${LOCAL_ONLY} Nothing was synced to ${destinationName}.`
      }
    );
    close();
  };
  const willDeleteUnmatched =
    values.syncOptions?.initialSyncBehavior ===
      SecretSyncInitialSyncBehavior.OverwriteDestination &&
    !values.syncOptions?.disableSecretDeletion &&
    !values.syncOptions?.keySchema;
  const goTo = (key: string) => setStep(tabs.findIndex((tab) => tab.key === key));
  const Destination = destination ? SYNC_VIEWS[destination]?.Destination : undefined;

  let body: ReactNode = null;
  if (destination && current) {
    if (step === 0) body = <SourceFields environments={environments} conflicts={conflicts} />;
    if (step === 1)
      body = Destination ? (
        <Destination />
      ) : (
        <Alert tone="neutral" title={NEXT_PHASE}>
          {destinationName} destination settings are not available in this composition yet.
        </Alert>
      );
    if (step === 2) body = <InitialSyncFields />;
    if (step === 3) body = <OptionsFields />;
    if (step === 4) body = <DetailsFields />;
    if (step === 5)
      body = <ReviewFields duplicateProject={duplicate ? duplicate.project : undefined} />;
  }

  return (
    <SyncConnections
      value={{
        connections,
        addConnection: (connection) => setConnections((list) => [...list, connection])
      }}
    >
      <FormProvider {...form}>
        <WizardSheet
          open={open}
          wide
          onRequestClose={() => request("close")}
          media={
            destination ? (
              <ProviderLogo image={SECRET_SYNC_MAP[destination].image} size={28} />
            ) : undefined
          }
          title={destination ? `${destinationName} sync` : "Choose a destination"}
          description={
            destination
              ? `Sync secrets to ${destinationName}`
              : "Where should Infisical write these secrets? You can change this later only by creating a new sync."
          }
          steps={
            destination
              ? [
                  { title: "Provider", summary: destinationName },
                  ...tabs.map((tab) => ({ title: tab.name, summary: tab.shortDescription }))
                ]
              : undefined
          }
          current={step + 1}
          onStepClick={handleStepClick}
          heading={current?.title}
          subtitle={current?.subtitle}
          aside={
            destination && current ? (
              <>
                <div className={flowStyles.asideHead}>
                  <span className={flowStyles.eyebrow}>{`Step ${step + 2}`}</span>
                  <span className={flowStyles.eyebrow}>{current.name}</span>
                  <Button asChild variant="ghost" size="xs" iconRight="external">
                    <a href={`${DOCS}/${destination}`} target="_blank" rel="noopener noreferrer">
                      Docs
                    </a>
                  </Button>
                </div>
                <p className={flowStyles.label}>What this step does</p>
                <SmallText muted>{current.rightDescription}</SmallText>
                {step >= 2 && (
                  <InitialSyncAlerts
                    onGoToInitialSync={() => goTo("initialSync")}
                    onGoToOptions={() => goTo("options")}
                  />
                )}
              </>
            ) : undefined
          }
          footer={
            destination ? (
              <Inline justify="between" wrap={false}>
                <SmallText muted>{isDirty ? "Unsaved changes" : ""}</SmallText>
                <Inline gap={12} wrap={false}>
                  <SmallText muted>{`Step ${step + 2} of ${tabs.length + 1}`}</SmallText>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => (step === 0 ? request("provider") : setStep(step - 1))}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    disabled={step === 0 && conflicts.length > 0}
                    onClick={handleNext}
                  >
                    {isFinalStep ? "Create sync" : "Continue"}
                  </Button>
                </Inline>
              </Inline>
            ) : undefined
          }
        >
          {destination ? (
            <form
              noValidate
              className={flowStyles.form}
              onSubmit={(event) => {
                event.preventDefault();
                handleNext();
              }}
            >
              {body}
            </form>
          ) : (
            <ProviderPicker onSelect={select} />
          )}
        </WizardSheet>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent icon="alert">
            <AlertDialogHeader>
              <AlertDialogTitle>Secret sync behavior</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <Stack gap={8}>
                    <span>Infisical is the source of truth for synced destinations.</span>
                    <span>
                      Secrets in the destination will be overwritten, and any direct edits there may
                      be overwritten by future syncs.
                    </span>
                    {willDeleteUnmatched && (
                      <span>
                        Secrets in {destinationName} that don&apos;t exist in Infisical will be
                        deleted.
                      </span>
                    )}
                  </Stack>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={form.handleSubmit(submit)}>
                I understand
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DiscardDialog
          open={Boolean(discard)}
          title="Discard sync setup?"
          description="Your progress configuring this sync will be lost."
          onKeep={() => setDiscard(undefined)}
          onDiscard={() => {
            if (discard === "close") close();
            else setDestination(null);
            setDiscard(undefined);
          }}
        />
      </FormProvider>
    </SyncConnections>
  );
}
