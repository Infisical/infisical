import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useJenkinsConnectionListFolders } from "@app/hooks/api/appConnections/jenkins";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { JenkinsSyncScope } from "@app/hooks/api/secretSyncs/types/jenkins-sync";

import { TSecretSyncForm } from "../schemas";

const SCOPE_HELP_TEXT: Record<JenkinsSyncScope, string> = {
  [JenkinsSyncScope.Global]:
    "Secrets are stored as Secret text credentials in the Jenkins global credentials store.",
  [JenkinsSyncScope.Folder]:
    "Secrets are stored as Secret text credentials in the selected folder's credentials store."
};

export const JenkinsSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Jenkins }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });

  const { data: folders = [], isPending: isFoldersLoading } = useJenkinsConnectionListFolders(
    connectionId,
    {
      enabled: Boolean(connectionId) && scope === JenkinsSyncScope.Folder
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", JenkinsSyncScope.Global);
          setValue("destinationConfig.folderPath", "");
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={JenkinsSyncScope.Global}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Scope</FieldLabel>
            <FieldContent>
              <Select
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  setValue("destinationConfig.folderPath", "");
                }}
              >
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(JenkinsSyncScope).map((jenkinsScope) => (
                    <SelectItem className="capitalize" value={jenkinsScope} key={jenkinsScope}>
                      {jenkinsScope}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {value && <FieldDescription>{SCOPE_HELP_TEXT[value]}</FieldDescription>}
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {scope === JenkinsSyncScope.Folder && (
        <Controller
          name="destinationConfig.folderPath"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel
                id="secret-sync-jenkins-folder-label"
                htmlFor="secret-sync-jenkins-folder"
              >
                Folder
              </FieldLabel>
              <FieldContent>
                <Combobox
                  aria-labelledby="secret-sync-jenkins-folder-label"
                  aria-describedby={error ? "secret-sync-jenkins-folder-error" : undefined}
                  id="secret-sync-jenkins-folder"
                  isError={Boolean(error)}
                  isLoading={isFoldersLoading && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={
                    folders.find((folder) => folder.fullName === value) ??
                    (value ? { name: value, fullName: value } : null)
                  }
                  onValueChange={(option) => {
                    onChange(option?.fullName ?? "");
                  }}
                  options={folders}
                  placeholder="Select a folder..."
                  getOptionLabel={(option) => option.fullName}
                  getOptionValue={(option) => option.fullName}
                  modal
                />
                <FieldError id="secret-sync-jenkins-folder-error" errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
