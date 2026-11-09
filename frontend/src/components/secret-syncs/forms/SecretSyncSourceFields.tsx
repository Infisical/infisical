import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { subject } from "@casl/ability";
import { Info } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Code,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Label,
  SecretPathInput,
  Spinner,
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
import { SecretSyncRecursiveConflictsAlert } from "./SecretSyncRecursiveConflictsAlert";
import { SecretSyncSourceFolderTree } from "./SecretSyncSourceFolderTree";

const DefaultSecretSyncSourceFields = () => {
  const { control, watch, setValue, setError, clearErrors } = useFormContext<TSecretSyncForm>();

  const { permission } = useProjectPermission();
  const { currentProject } = useProject();

  const destination = watch("destination");
  const selectedEnvironment = watch("environment");
  const selectedSecretPath = watch("secretPath");
  const includeAllSubFolders = watch("syncOptions.includeAllSubFolders");
  const keySchema = watch("syncOptions.keySchema");

  const { syncOption } = useSecretSyncOption(destination);

  // Only these destinations choose how folders map in the Destination step, so only they preview
  // the folder tree here and leave duplicate names to that step.
  const supportsFolderStructure = Boolean(syncOption?.supportsPreserveFolderStructure);

  const { conflicts, folders, isChecking } = useRecursiveConflictsCheck({
    destination,
    projectId: currentProject.id,
    environment: selectedEnvironment?.slug,
    secretPath: selectedSecretPath,
    keySchema,
    includeAllSubFolders: Boolean(includeAllSubFolders)
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
        name="syncOptions.includeAllSubFolders"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <Field orientation="horizontal">
              {supportsFolderStructure ? (
                <FieldContent>
                  <Label htmlFor="includeAllSubFolders">Include nested folders</Label>
                  <FieldDescription>
                    When enabled, every folder under <Code>{selectedSecretPath || "/"}</Code> is
                    included, however deep. How folders map to the destination is chosen in the next
                    step. Turn off to sync only the secrets directly at this path.
                  </FieldDescription>
                </FieldContent>
              ) : (
                <FieldContent>
                  <Label htmlFor="includeAllSubFolders">Include secrets from all subfolders</Label>
                  <FieldDescription>
                    Also sync secrets from every folder beneath this path, however deep. Secret
                    names must be unique across all of them.
                  </FieldDescription>
                </FieldContent>
              )}
              <Toggle
                id="includeAllSubFolders"
                variant="project"
                checked={Boolean(value)}
                onCheckedChange={(checked) => {
                  onChange(checked);

                  // Without subfolders there are no folders to keep, and the API refuses the option.
                  if (!checked && supportsFolderStructure) {
                    setValue("syncOptions.preserveFolderStructure", false);
                  }

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
              <Alert variant="warning">
                <Info />
                <AlertTitle>Initial sync is set to overwrite the destination</AlertTitle>
                <AlertDescription>
                  A sync that includes subfolders cannot import secrets from the destination into
                  Infisical, because there is no single folder to import them into.
                </AlertDescription>
              </Alert>
            )}
            {Boolean(value) && supportsFolderStructure && (
              <SecretSyncSourceFolderTree
                secretPath={selectedSecretPath}
                folders={folders}
                conflicts={conflicts}
                isLoading={isChecking}
              />
            )}
            {isChecking && !supportsFolderStructure && (
              <div className="flex items-center gap-2">
                <Spinner size="xs" />
                <p className="text-xs text-label">
                  Checking for naming conflicts across folders...
                </p>
              </div>
            )}
            {!isChecking && conflicts.length > 0 && !supportsFolderStructure && (
              <SecretSyncRecursiveConflictsAlert
                conflicts={conflicts}
                description="This destination stores secrets in a single flat list, so each name can be used only once. Rename or move one secret in each pair, or point the sync at a narrower secret path."
              />
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
