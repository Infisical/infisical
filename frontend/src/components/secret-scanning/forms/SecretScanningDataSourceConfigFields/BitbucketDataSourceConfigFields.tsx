import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { useBitbucketConnectionListWorkspaces } from "@app/hooks/api/appConnections/bitbucket";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConnectionField } from "../SecretScanningDataSourceConnectionField";

type TBitbucketForm = TSecretScanningDataSourceForm & {
  type: SecretScanningDataSource.Bitbucket;
};

export const BitbucketDataSourceConnectionFields = () => {
  const { control, setValue } = useFormContext<TBitbucketForm>();

  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [debouncedWorkspaceSearch] = useDebounce(workspaceSearch, 300);

  const connectionId = useWatch({ control, name: "connection.id" });
  const isUpdate = Boolean(useWatch({ control, name: "id" }));

  const { data: workspaces = [], isPending: areWorkspacesLoading } =
    useBitbucketConnectionListWorkspaces(connectionId, debouncedWorkspaceSearch || undefined, {
      enabled: Boolean(connectionId)
    });

  return (
    <>
      <SecretScanningDataSourceConnectionField
        isUpdate={isUpdate}
        onChange={() => setValue("config.workspaceSlug", "")}
      />
      <Controller
        name="config.workspaceSlug"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabel
              id="secret-scanning-bitbucket-workspace-label"
              htmlFor="secret-scanning-bitbucket-workspace"
            >
              Workspace
            </FieldLabel>
            <FieldContent>
              <Combobox
                id="secret-scanning-bitbucket-workspace"
                aria-labelledby="secret-scanning-bitbucket-workspace-label"
                aria-describedby="secret-scanning-bitbucket-workspace-help"
                isError={Boolean(error)}
                isLoading={areWorkspacesLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                isClearable={false}
                value={value || null}
                onValueChange={onChange}
                onInputValueChange={setWorkspaceSearch}
                shouldFilter={false}
                includeMissingSelectedOptions={!workspaceSearch}
                options={workspaces.map((workspace) => workspace.slug)}
                placeholder="Search for a workspace..."
                searchAriaLabel="Search workspaces"
                getOptionLabel={(option) => option}
                getOptionValue={(option) => option}
                emptyMessage={(inputValue) =>
                  inputValue ? "No workspaces found matching your search." : "No workspaces found."
                }
                modal
              />
              <FieldDescription id="secret-scanning-bitbucket-workspace-help">
                Bitbucket requires a workspace to know where to look for repositories.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </>
  );
};
