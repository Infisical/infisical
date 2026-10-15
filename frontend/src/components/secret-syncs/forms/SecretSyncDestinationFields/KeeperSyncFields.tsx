import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useKeeperConnectionListSharedFolders } from "@app/hooks/api/appConnections/keeper";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const KeeperSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Keeper }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: sharedFolders, isLoading: isSharedFoldersLoading } =
    useKeeperConnectionListSharedFolders(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.folderUid", "");
          setValue("destinationConfig.folderName", "");
        }}
      />

      <Controller
        name="destinationConfig.folderUid"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-keeper-folder-uid-label"
              htmlFor="secret-sync-keeper-folder-uid"
            >
              Shared Folder
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Secrets are synced as login records in this shared folder. The record title holds
                  the secret key and the password field holds the secret value.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-keeper-folder-uid-label"
                aria-describedby={error ? "secret-sync-keeper-folder-uid-error" : undefined}
                id="secret-sync-keeper-folder-uid"
                isError={Boolean(error)}
                isLoading={isSharedFoldersLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={sharedFolders?.find((folder) => folder.uid === value) || null}
                onValueChange={(option) => {
                  onChange(option?.uid ?? "");
                  setValue("destinationConfig.folderName", option?.name ?? "");
                }}
                options={sharedFolders}
                placeholder="Select a shared folder..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.uid}
                getOptionKeywords={(option) => [option.uid]}
                modal
              />
              <FieldError id="secret-sync-keeper-folder-uid-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
