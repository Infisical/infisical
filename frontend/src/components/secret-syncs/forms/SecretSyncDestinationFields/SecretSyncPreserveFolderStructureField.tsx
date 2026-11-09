import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { ArrowRight, CircleCheck } from "lucide-react";

import {
  Badge,
  Code,
  Field,
  FieldContent,
  FieldDescription,
  Label,
  Toggle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { applySecretSyncKeySchema, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync, useRecursiveConflictsCheck } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { SecretSyncRecursiveConflictsAlert } from "../SecretSyncRecursiveConflictsAlert";

const MAX_DISPLAYED_ROWS = 8;

type Props = {
  // Prepended to every destination name, eg a Parameter Store path.
  destinationPrefix?: string;
  // False where the destination's current settings have no names to put folders in, eg Secrets
  // Manager's many-to-one mapping. Only the duplicate names are shown then.
  canPreserve?: boolean;
};

const getRelativeFolder = (path: string, secretPath: string) =>
  path.split("/").filter(Boolean).slice(secretPath.split("/").filter(Boolean).length).join("/");

export const SecretSyncPreserveFolderStructureField = ({
  destinationPrefix = "",
  canPreserve = true
}: Props) => {
  const { control, watch } = useFormContext<TSecretSyncForm>();
  const { currentProject } = useProject();

  const destination = watch("destination");
  const environment = watch("environment");
  const secretPath = watch("secretPath");
  const keySchema = watch("syncOptions.keySchema");
  const includeAllSubFolders = Boolean(watch("syncOptions.includeAllSubFolders"));
  const preserveFolderStructure = Boolean(watch("syncOptions.preserveFolderStructure"));

  const { conflicts, folders } = useRecursiveConflictsCheck({
    destination,
    projectId: currentProject.id,
    environment: environment?.slug,
    secretPath,
    keySchema,
    includeAllSubFolders
  });

  const { rows, keyCount, pathCount } = useMemo(() => {
    const conflictingFolders = new Set(conflicts.flatMap((conflict) => conflict.paths));
    const names = applySecretSyncKeySchema(keySchema, "*", environment?.slug ?? "");

    const mapped = folders.map(({ path }) => {
      const folder = preserveFolderStructure ? getRelativeFolder(path, secretPath) : "";

      return {
        source: `${path === "/" ? "" : path}/*`,
        destination: `${destinationPrefix}${folder ? `${folder}/` : ""}${names}`,
        isDuplicate: conflictingFolders.has(path)
      };
    });

    return {
      rows: mapped.sort((a, b) => Number(b.isDuplicate) - Number(a.isDuplicate)),
      keyCount: folders.reduce((total, folder) => total + folder.secretCount, 0),
      pathCount: new Set(mapped.map((row) => row.destination)).size
    };
  }, [
    folders,
    conflicts,
    keySchema,
    environment?.slug,
    secretPath,
    destinationPrefix,
    preserveFolderStructure
  ]);

  if (!includeAllSubFolders) return null;

  const destinationName = SECRET_SYNC_MAP[destination].name;
  const nestedFolder = folders.find(({ path }) => getRelativeFolder(path, secretPath));
  const exampleFolder = nestedFolder ? getRelativeFolder(nestedFolder.path, secretPath) : "api";
  const sourceRoot = secretPath === "/" ? "" : secretPath;

  return (
    <>
      {canPreserve && (
        <Controller
          control={control}
          name="syncOptions.preserveFolderStructure"
          render={({ field: { value, onChange } }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <Label htmlFor="preserveFolderStructure">Mirror folder structure</Label>
                {destination === SecretSync.AWSParameterStore ? (
                  <FieldDescription>
                    Recreate the Infisical folder tree under <Code>{destinationPrefix}</Code>, so{" "}
                    <Code>
                      {sourceRoot}/{exampleFolder}
                    </Code>{" "}
                    becomes{" "}
                    <Code>
                      {destinationPrefix}
                      {exampleFolder}
                    </Code>{" "}
                    and duplicate keys never collide. Turn off to write every key directly at{" "}
                    <Code>{destinationPrefix}</Code>, where each key name must be unique across
                    folders.
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    Prefix each secret&apos;s name with its folder, so{" "}
                    <Code>
                      {sourceRoot}/{exampleFolder}/API_KEY
                    </Code>{" "}
                    becomes <Code>{exampleFolder}/API_KEY</Code> and duplicate keys never collide.
                    Turn off to name each secret by its key alone, where each key name must be
                    unique across folders.
                  </FieldDescription>
                )}
              </FieldContent>
              <Toggle
                id="preserveFolderStructure"
                variant="project"
                checked={Boolean(value)}
                onCheckedChange={onChange}
              />
            </Field>
          )}
        />
      )}
      {canPreserve && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-label">Where keys land</p>
            <p className="text-xs text-muted">
              {keyCount} {keyCount === 1 ? "key" : "keys"} · {pathCount}{" "}
              {pathCount === 1 ? "path" : "paths"}
            </p>
          </div>
          <div className="overflow-hidden rounded-md border border-border text-sm">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 border-b border-border px-4 py-2 text-xs text-muted">
              <span>Infisical</span>
              <span className="w-3.5" />
              <span>{destinationName}</span>
            </div>
            {rows.slice(0, MAX_DISPLAYED_ROWS).map((row) => (
              <div
                key={row.source}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
              >
                <span className="truncate font-mono">{row.source}</span>
                <ArrowRight className="size-3.5 text-muted" />
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono">{row.destination}</span>
                  {row.isDuplicate && (
                    <Badge
                      className="ml-auto shrink-0"
                      variant={preserveFolderStructure ? "success" : "danger"}
                    >
                      {preserveFolderStructure ? "No Collision" : "Collision"}
                    </Badge>
                  )}
                </span>
              </div>
            ))}
            {rows.length > MAX_DISPLAYED_ROWS && (
              <p className="border-b border-border px-4 py-2 text-xs text-muted last:border-b-0">
                and {rows.length - MAX_DISPLAYED_ROWS} more
              </p>
            )}
            {preserveFolderStructure && (
              <p className="flex items-center gap-2 px-4 py-2.5 text-xs text-label">
                <CircleCheck className="size-4 shrink-0 text-success" />
                The folder tree is recreated one-to-one, so duplicate keys never collide.
              </p>
            )}
          </div>
        </div>
      )}
      {!preserveFolderStructure && conflicts.length > 0 && (
        <SecretSyncRecursiveConflictsAlert
          conflicts={conflicts}
          description={
            canPreserve
              ? "With the folder structure flattened, each name can be used only once. Turn on Mirror folder structure to keep each secret at its own path, or rename or move one secret in each pair."
              : "Many-to-one mapping writes every secret into one AWS secret, so each name can be used only once. Switch to one-to-one mapping and turn on Mirror folder structure, or rename or move one secret in each pair."
          }
        />
      )}
    </>
  );
};
