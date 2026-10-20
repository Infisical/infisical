import { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { TGitLabGroup, useGitLabConnectionListGroups } from "@app/hooks/api/appConnections/gitlab";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

import { TSecretScanningDataSourceForm } from "../schemas";
import { SecretScanningDataSourceConnectionField } from "../SecretScanningDataSourceConnectionField";

const GITLAB_DATA_SOURCE_LIST_LIMIT = 20;

type TGitLabForm = TSecretScanningDataSourceForm & { type: SecretScanningDataSource.GitLab };

export const GitLabDataSourceConnectionFields = () => {
  const { control, setValue } = useFormContext<TGitLabForm>();

  const connectionId = useWatch({ control, name: "connection.id" });
  const isUpdate = Boolean(useWatch({ control, name: "id" }));
  const scope = useWatch({ control, name: "config.scope" });
  const groupId = useWatch({ control, name: "config.groupId" });
  const groupName = useWatch({ control, name: "config.groupName" });
  const projectName = useWatch({ control, name: "config.projectName" });
  const projectId = useWatch({ control, name: "config.projectId" });

  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedGroupSearch] = useDebounce(groupSearch, 300);

  const { data: groups, isPending: isGroupsPending } = useGitLabConnectionListGroups(
    connectionId,
    debouncedGroupSearch || undefined,
    GITLAB_DATA_SOURCE_LIST_LIMIT,
    { enabled: Boolean(connectionId) && !isUpdate }
  );

  const groupOptions = useMemo(() => {
    const results = groups ?? [];
    if (groupId && groupName && !results.some((group) => Number(group.id) === groupId)) {
      return [
        { id: String(groupId), name: groupName, fullName: groupName, fullPath: groupName },
        ...results
      ];
    }
    return results;
  }, [groups, groupId, groupName]);

  const selectGroup = (group: TGitLabGroup | null) => {
    setValue("config.scope", group ? GitLabDataSourceScope.Group : GitLabDataSourceScope.Account);
    // @ts-expect-error rhf doesn't like this but we need to reset
    setValue("config.groupId", group ? Number(group.id) : undefined);
    setValue("config.groupName", group?.fullName ?? "");
    setValue("isDiscoveryEnabled", Boolean(group));
  };

  return (
    <>
      <SecretScanningDataSourceConnectionField
        isUpdate={isUpdate}
        onChange={() => {
          selectGroup(null);
          setGroupSearch("");
        }}
      />
      {scope === GitLabDataSourceScope.Project ? (
        <Field data-disabled>
          <FieldLabel htmlFor="secret-scanning-gitlab-project">Project</FieldLabel>
          <FieldContent>
            <Input
              id="secret-scanning-gitlab-project"
              value={projectName || String(projectId ?? "")}
              aria-describedby="secret-scanning-gitlab-project-help"
              readOnly
              disabled
            />
            <FieldDescription id="secret-scanning-gitlab-project-help">
              Project scope is no longer offered for new data sources. Cannot be updated.
            </FieldDescription>
          </FieldContent>
        </Field>
      ) : (
        <Controller
          name="config.groupId"
          control={control}
          render={({ field: { value }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)} data-disabled={isUpdate}>
              <FieldLabel
                id="secret-scanning-gitlab-group-label"
                htmlFor="secret-scanning-gitlab-group"
              >
                Group (Optional)
              </FieldLabel>
              <FieldContent>
                <Combobox<TGitLabGroup>
                  id="secret-scanning-gitlab-group"
                  aria-labelledby="secret-scanning-gitlab-group-label"
                  aria-describedby="secret-scanning-gitlab-group-help"
                  isError={Boolean(error)}
                  isLoading={isGroupsPending && Boolean(connectionId) && !isUpdate}
                  isDisabled={!connectionId || isUpdate}
                  value={groupOptions.find((group) => Number(group.id) === value) ?? null}
                  onValueChange={selectGroup}
                  onInputValueChange={setGroupSearch}
                  shouldFilter={false}
                  options={groupOptions}
                  placeholder="All accessible projects"
                  searchAriaLabel="Search groups"
                  clearAriaLabel="Clear group"
                  getOptionLabel={(option) => option.fullPath}
                  getOptionValue={(option) => option.id}
                  emptyMessage={(inputValue) =>
                    inputValue ? "No groups found matching your search." : "No groups found."
                  }
                  modal
                />
                <FieldDescription id="secret-scanning-gitlab-group-help">
                  {isUpdate
                    ? "Cannot be updated."
                    : "Leave empty to cover every project the connection can read, including your own. Select a group to discover projects added to it later."}
                </FieldDescription>
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </>
  );
};
