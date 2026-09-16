import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { subject } from "@casl/ability";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Label,
  SecretPathInput,
  Toggle
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  SecretSync,
  SecretSyncInitialSyncBehavior,
  useRecursiveConflictsCheck,
  useSecretSyncOption
} from "@app/hooks/api/secretSyncs";

import { AzureEntraIdScimSyncSourceFields } from "./AzureEntraIdScimSyncSourceFields";
import { TSecretSyncForm } from "./schemas";

const MAX_DISPLAYED_CONFLICTS = 5;

const DefaultSecretSyncSourceFields = () => {
  const { control, watch, setValue, setError, clearErrors } = useFormContext<TSecretSyncForm>();

  const { permission } = useProjectPermission();
  const { currentProject } = useProject();

  const destination = watch("destination");
  const selectedEnvironment = watch("environment");
  const selectedSecretPath = watch("secretPath");
  const recursive = watch("syncOptions.recursive");
  const keySchema = watch("syncOptions.keySchema");

  const { syncOption } = useSecretSyncOption(destination);

  const { conflicts, isChecking, isClear } = useRecursiveConflictsCheck({
    destination,
    projectId: currentProject.id,
    environment: selectedEnvironment?.slug,
    secretPath: selectedSecretPath,
    keySchema,
    recursive: Boolean(recursive)
  });

  useEffect(() => {
    if (!selectedEnvironment) {
      clearErrors("secretPath");
      return;
    }

    const hasAccessToSource = permission.can(
      ProjectPermissionSecretSyncActions.Create,
      subject(ProjectPermissionSub.SecretSyncs, {
        environment: selectedEnvironment.slug,
        secretPath: selectedSecretPath
      })
    );

    if (!hasAccessToSource) {
      setError("secretPath", {
        message: "You do not have permission to create secret syncs in this environment or path."
      });
    } else {
      clearErrors("secretPath");
    }
  }, [selectedEnvironment, selectedSecretPath]);

  return (
    <FieldGroup>
      <Controller
        defaultValue={currentProject.environments[0]}
        control={control}
        name="environment"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <FieldContent>
              <Combobox
                value={value}
                onValueChange={onChange}
                options={currentProject.environments}
                placeholder="Select environment..."
                getOptionLabel={(option) => option?.name}
                getOptionValue={(option) => option?.id}
                isError={Boolean(error)}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        defaultValue="/"
        control={control}
        name="secretPath"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Secret Path</FieldLabel>
            <FieldContent>
              <SecretPathInput
                environment={selectedEnvironment?.slug}
                value={value}
                onChange={onChange}
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        control={control}
        name="syncOptions.recursive"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <Field orientation="horizontal">
              <FieldContent>
                <Label htmlFor="recursive">Include secrets from subfolders</Label>
                <FieldDescription>
                  Also sync secrets from every folder beneath this path, however deep. Secret names
                  must be unique across all of them.
                </FieldDescription>
              </FieldContent>
              <Toggle
                id="recursive"
                variant="project"
                checked={Boolean(value)}
                onCheckedChange={(checked) => {
                  onChange(checked);

                  // There is no single folder to import a subtree back into, so the backend rejects
                  // the combination. Move the user off it here rather than failing them on save.
                  if (checked) {
                    setValue(
                      "syncOptions.initialSyncBehavior",
                      SecretSyncInitialSyncBehavior.OverwriteDestination
                    );
                  }
                }}
              />
            </Field>
            <FieldError errors={[error]} />
            {Boolean(value) && syncOption?.canImportSecrets && (
              <Alert variant="info">
                <Info />
                <AlertTitle>Initial sync is set to overwrite the destination</AlertTitle>
                <AlertDescription>
                  A sync that includes subfolders cannot import secrets from the destination into
                  Infisical, because there is no single folder to import them into.
                </AlertDescription>
              </Alert>
            )}
            {isChecking && (
              <p className="text-sm text-muted">Checking for naming conflicts across folders...</p>
            )}
            {isClear && (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="size-4" />
                No naming collisions detected
              </p>
            )}
            {!isChecking && conflicts.length > 0 && (
              <Alert variant="danger">
                <TriangleAlert />
                <AlertTitle>
                  {conflicts.length === 1
                    ? "1 secret name conflicts across folders"
                    : `${conflicts.length} secret names conflict across folders`}
                </AlertTitle>
                <AlertDescription>
                  <p>
                    This destination stores secrets in a single flat list, so each name can be used
                    only once. Rename or move one secret in each pair, or point the sync at a
                    narrower secret path.
                  </p>
                  <ul className="mt-1 space-y-2">
                    {conflicts.slice(0, MAX_DISPLAYED_CONFLICTS).map((conflict) => (
                      <li key={conflict.key}>
                        <span className="font-mono font-semibold">&quot;{conflict.key}&quot;</span>{" "}
                        is used in {conflict.paths.length} folders:
                        <ul className="mt-0.5 list-inside list-disc">
                          {conflict.paths.map((path) => (
                            <li key={path} className="font-mono">
                              {path}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                  {conflicts.length > MAX_DISPLAYED_CONFLICTS && (
                    <p>and {conflicts.length - MAX_DISPLAYED_CONFLICTS} more</p>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </Field>
        )}
      />
    </FieldGroup>
  );
};

export const SecretSyncSourceFields = () => {
  const { control } = useFormContext<TSecretSyncForm>();
  const destination = useWatch({ control, name: "destination" });

  switch (destination) {
    case SecretSync.AzureEntraIdScim:
      return <AzureEntraIdScimSyncSourceFields />;
    default:
      return <DefaultSecretSyncSourceFields />;
  }
};
