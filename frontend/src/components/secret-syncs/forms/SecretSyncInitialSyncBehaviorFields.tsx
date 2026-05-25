import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { ArrowDown, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSync,
  SecretSyncInitialSyncBehavior,
  useSecretSyncOption
} from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "./schemas";

type GraphicVariant = "overwrite" | "prioritize-infisical" | "prioritize-destination";

const getGraphicVariant = (key: string): GraphicVariant => {
  if (key === SecretSyncInitialSyncBehavior.OverwriteDestination) return "overwrite";
  if (key === SecretSyncInitialSyncBehavior.ImportPrioritizeSource) return "prioritize-infisical";
  return "prioritize-destination";
};

const getShortDestinationName = (name: string) => name.split(" ")[0];

const getBehaviorCopy = (
  key: SecretSyncInitialSyncBehavior,
  destinationName: string
): { title: string; description: string } => {
  const shortName = getShortDestinationName(destinationName);
  switch (key) {
    case SecretSyncInitialSyncBehavior.OverwriteDestination:
      return {
        title: `Overwrite ${destinationName}`,
        description: `On the initial sync, Infisical will write its secrets to ${destinationName}. No secrets will be imported from ${shortName}. Depending on your configuration this can lead to removal of secrets from ${shortName}.`
      };
    case SecretSyncInitialSyncBehavior.ImportPrioritizeSource:
      return {
        title: `Import from ${shortName} — prioritize Infisical`,
        description: `Prior to the initial sync, Infisical will import secrets from ${destinationName}. If an imported secret already exists in Infisical, the imported secret value is ignored, preserving the Infisical value.`
      };
    case SecretSyncInitialSyncBehavior.ImportPrioritizeDestination:
    default:
      return {
        title: `Import from ${shortName} — prioritize ${shortName}`,
        description: `Prior to the initial sync, Infisical will import secrets from ${destinationName}. If an imported secret already exists in Infisical, the imported secret value will overwrite the existing value in Infisical.`
      };
  }
};
type SecretFate = "kept" | "added" | "removed" | "updated" | "imported";

type ReconciliationRow = { name: string; fate?: SecretFate };

const fateConfig: Record<
  Exclude<SecretFate, "kept">,
  { label: string; badgeClass: string; wrapperClass: string }
> = {
  added: {
    label: "added",
    badgeClass: "text-success",
    wrapperClass: "border-success/50 bg-success/5"
  },
  updated: {
    label: "updated",
    badgeClass: "text-warning",
    wrapperClass: "border-warning/40 bg-warning/5"
  },
  imported: {
    label: "imported",
    badgeClass: "text-info",
    wrapperClass: "border-info/50 bg-info/5"
  },
  removed: {
    label: "removed",
    badgeClass: "text-danger",
    wrapperClass: "border-danger/40 bg-danger/5"
  }
};

const SecretRow = ({ name, fate }: ReconciliationRow) => {
  const config = fate && fate !== "kept" ? fateConfig[fate] : null;
  const isRemoved = fate === "removed";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded border px-2 py-1 text-[10px]",
        config ? config.wrapperClass : "border-border bg-container"
      )}
    >
      <span
        className={cn(
          "truncate font-mono text-foreground/80",
          isRemoved && "text-danger/70 line-through"
        )}
      >
        {name}
      </span>
      {config && (
        <span className={cn("shrink-0 text-[9px] tracking-wider uppercase", config.badgeClass)}>
          {config.label}
        </span>
      )}
    </div>
  );
};

const ReconciliationLegend = () => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] tracking-wider text-muted uppercase">
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-3 rounded-[2px] border border-border bg-mineshaft-800/80" />
      unchanged
    </span>
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-3 rounded-[2px] border border-warning/40 bg-warning/5" />
      value updated
    </span>
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-3 rounded-[2px] border border-success/50 bg-success/5" />
      added
    </span>
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-3 rounded-[2px] border border-info/50 bg-info/5" />
      imported
    </span>
    <span className="flex items-center gap-1">
      <span className="inline-block h-2 w-3 rounded-[2px] border border-danger/40 bg-danger/5" />
      removed
    </span>
  </div>
);

const BEFORE_INFISICAL: ReconciliationRow[] = [{ name: "API_KEY" }, { name: "DB_URL" }];
const BEFORE_DESTINATION: ReconciliationRow[] = [{ name: "API_KEY" }, { name: "LEGACY_TOKEN" }];

const getAfterRows = (
  variant: GraphicVariant
): { infisical: ReconciliationRow[]; destination: ReconciliationRow[] } => {
  switch (variant) {
    case "overwrite":
      return {
        infisical: [{ name: "API_KEY" }, { name: "DB_URL" }],
        destination: [
          { name: "API_KEY", fate: "updated" },
          { name: "DB_URL", fate: "added" },
          { name: "LEGACY_TOKEN", fate: "removed" }
        ]
      };
    case "prioritize-infisical":
      return {
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
      };
    case "prioritize-destination":
    default:
      return {
        infisical: [
          { name: "API_KEY", fate: "updated" },
          { name: "DB_URL" },
          { name: "LEGACY_TOKEN", fate: "imported" }
        ],
        destination: [
          { name: "API_KEY" },
          { name: "DB_URL", fate: "added" },
          { name: "LEGACY_TOKEN" }
        ]
      };
  }
};

const ReconciliationSection = ({
  title,
  subtitle,
  destinationName,
  infisicalRows,
  destinationRows
}: {
  title: string;
  subtitle: string;
  destinationName: string;
  infisicalRows: ReconciliationRow[];
  destinationRows: ReconciliationRow[];
}) => (
  <div className="rounded-md border border-border bg-mineshaft-800/30 p-3">
    <div className="mb-3 flex items-baseline gap-2">
      <p className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</p>
      <p className="text-xs text-muted">{subtitle}</p>
    </div>
    <div className="grid grid-cols-2 items-start gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="truncate text-[10px] font-medium tracking-wider text-muted uppercase">
          Infisical
        </p>
        <div className="flex flex-col gap-1">
          {infisicalRows.map((row) => (
            <SecretRow key={row.name} {...row} />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="truncate text-[10px] font-medium tracking-wider text-muted uppercase">
          {destinationName}
        </p>
        <div className="flex flex-col gap-1">
          {destinationRows.map((row) => (
            <SecretRow key={row.name} {...row} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const ReconciliationDiagram = ({
  variant,
  destinationName
}: {
  variant: GraphicVariant;
  destinationName: string;
}) => {
  const after = getAfterRows(variant);

  return (
    <div className="mt-2 flex flex-col gap-2" aria-hidden="true">
      <ReconciliationSection
        title="Before"
        subtitle="The secrets currently on each side, before the first sync runs"
        destinationName={destinationName}
        infisicalRows={BEFORE_INFISICAL}
        destinationRows={BEFORE_DESTINATION}
      />
      <div className="flex items-center gap-3 px-1">
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-muted uppercase">
          <ArrowDown className="size-3" strokeWidth={2.5} />
          First sync runs
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
      <ReconciliationSection
        title="After"
        subtitle="How each side looks once the first sync completes"
        destinationName={destinationName}
        infisicalRows={after.infisical}
        destinationRows={after.destination}
      />
      <div className="mt-1 px-1">
        <ReconciliationLegend />
      </div>
    </div>
  );
};

const BEHAVIOR_ORDER: SecretSyncInitialSyncBehavior[] = [
  SecretSyncInitialSyncBehavior.OverwriteDestination,
  SecretSyncInitialSyncBehavior.ImportPrioritizeSource,
  SecretSyncInitialSyncBehavior.ImportPrioritizeDestination
];

type InitialSyncAlertsProps = {
  onGoToInitialSync?: () => void;
  onGoToOptions?: () => void;
};

export const InitialSyncAlerts = ({
  onGoToInitialSync,
  onGoToOptions
}: InitialSyncAlertsProps = {}) => {
  const { watch } = useFormContext<TSecretSyncForm>();
  const destination = watch("destination");
  const destinationName = SECRET_SYNC_MAP[destination].name;
  const vercelSensitive =
    destination === SecretSync.Vercel
      ? Boolean(watch("destinationConfig.sensitive" as never))
      : false;
  const initialSyncBehavior = watch("syncOptions.initialSyncBehavior");
  const disableSecretDeletion = watch("syncOptions.disableSecretDeletion");
  const keySchema = watch("syncOptions.keySchema");

  const linkClass =
    "font-medium text-warning cursor-pointer underline underline-offset-2 hover:text-warning/80 focus-visible:outline-1 focus-visible:outline-danger";

  const renderRemedy = (text: string, onClick?: () => void) =>
    onClick ? (
      <button type="button" onClick={onClick} className={linkClass}>
        {text}
      </button>
    ) : (
      text
    );

  return (
    !vercelSensitive &&
    initialSyncBehavior === SecretSyncInitialSyncBehavior.OverwriteDestination &&
    !disableSecretDeletion &&
    !keySchema && (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>External secrets will be deleted</AlertTitle>
        <AlertDescription>
          <p>
            Anything in {destinationName} not in Infisical will be removed. To keep them,{" "}
            {renderRemedy("import from provider", onGoToInitialSync)},{" "}
            {renderRemedy("customize key names", onGoToOptions)}, or{" "}
            {renderRemedy("disable secret deletion", onGoToOptions)}.
          </p>
        </AlertDescription>
      </Alert>
    )
  );
};

export const SecretSyncInitialSyncBehaviorFields = () => {
  const { control, watch, setValue } = useFormContext<TSecretSyncForm>();

  const destination = watch("destination");
  const destinationName = SECRET_SYNC_MAP[destination].name;
  const { syncOption } = useSecretSyncOption(destination);

  const vercelSensitive =
    destination === SecretSync.Vercel
      ? Boolean(watch("destinationConfig.sensitive" as never))
      : false;

  const currentInitialBehavior = watch("syncOptions.initialSyncBehavior");
  const disableSecretDeletion = watch("syncOptions.disableSecretDeletion");
  const keySchema = watch("syncOptions.keySchema");

  // Vercel "sensitive" secrets cannot be read back, so importing destination secrets is impossible.
  // Force the initial sync behavior to OverwriteDestination whenever sensitive is enabled.
  useEffect(() => {
    if (
      vercelSensitive &&
      currentInitialBehavior !== SecretSyncInitialSyncBehavior.OverwriteDestination
    ) {
      setValue(
        "syncOptions.initialSyncBehavior",
        SecretSyncInitialSyncBehavior.OverwriteDestination
      );
    }
  }, [vercelSensitive, currentInitialBehavior, setValue]);

  const importAvailable = Boolean(syncOption?.canImportSecrets) && !vercelSensitive;
  const behaviorKeys = importAvailable
    ? BEHAVIOR_ORDER
    : [SecretSyncInitialSyncBehavior.OverwriteDestination];

  return (
    <>
      {!vercelSensitive && !syncOption?.canImportSecrets && (
        <Alert className="mb-3" variant="warning">
          <TriangleAlert />
          <AlertTitle>Importing secrets is not supported</AlertTitle>
          <AlertDescription>
            {destinationName} only supports overwrite.
            {!disableSecretDeletion &&
              !keySchema &&
              (syncOption?.supportsKeySchema !== false ||
                syncOption?.supportsDisableSecretDeletion !== false) &&
              " Secrets not in Infisical will be removed — add a key schema or disable secret deletion to keep them."}
          </AlertDescription>
        </Alert>
      )}
      {vercelSensitive && (
        <Alert className="mb-3" variant="warning">
          <TriangleAlert />
          <AlertTitle>Overwrite only</AlertTitle>
          <AlertDescription>
            Vercel can&apos;t read sensitive secrets back, so Infisical must overwrite the
            destination.
          </AlertDescription>
        </Alert>
      )}
      {destination === SecretSync.Vercel &&
        !vercelSensitive &&
        currentInitialBehavior !== SecretSyncInitialSyncBehavior.OverwriteDestination && (
          <Alert className="mb-3" variant="warning">
            <TriangleAlert />
            <AlertTitle>Limited import for team-scoped syncs</AlertTitle>
            <AlertDescription>
              Only Vercel shared environment variables whose scope exactly matches this sync&apos;s
              configuration (target environments, target projects, and Apply to all Custom
              Environments) will be imported. Variables covering a broader scope, or split across
              separate records per environment, will not be imported on the initial sync.
            </AlertDescription>
          </Alert>
        )}
      <Controller
        control={control}
        name="syncOptions.initialSyncBehavior"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <RadioGroup value={value} onValueChange={onChange} className="gap-3">
              {behaviorKeys.map((key) => {
                const { title, description } = getBehaviorCopy(key, destinationName);
                const id = `initial-sync-${key}`;
                return (
                  <FieldLabel key={key} htmlFor={id} variant="project">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{title}</FieldTitle>
                        <FieldDescription className="text-wrap!">{description}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={key} id={id} isError={Boolean(error)} />
                    </Field>
                  </FieldLabel>
                );
              })}
            </RadioGroup>
            {value && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium tracking-wider text-muted uppercase">
                  Example
                </p>
                <ReconciliationDiagram
                  variant={getGraphicVariant(value)}
                  destinationName={destinationName}
                />
              </div>
            )}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
