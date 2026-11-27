import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import {
  GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH,
  GITLAB_TOKEN_NAME_MAX_LENGTH
} from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Combobox,
  Field,
  FieldError,
  FieldFeedback,
  Input
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { TGitLabGroup, useGitLabConnectionListGroups } from "@app/hooks/api/appConnections/gitlab";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { GitLabTokenScope } from "@app/hooks/api/secretRotationsV2/types/gitlab-service-account-token-rotation";

const GITLAB_GROUP_LIST_LIMIT = 20;
const GITLAB_SEARCH_DEBOUNCE_MS = 500;

type TGitLabTokenRotationForm = TSecretRotationV2Form & {
  type: SecretRotation.GitLabServiceAccountToken | SecretRotation.GitLabGroupAccessToken;
};

const renderGroupOption = (group: TGitLabGroup) => (
  <div className="min-w-0">
    <p className="truncate">{group.name}</p>
    {group.fullPath !== group.name && (
      <p className="truncate text-xs leading-4 text-muted">{group.fullPath}</p>
    )}
  </div>
);

export const GitLabTokenConnectionAlert = () => (
  <Alert variant="info">
    <InfoIcon />
    <AlertTitle>Connection requirements</AlertTitle>
    <AlertDescription>
      Use a connection with a personal access token or OAuth whose user has the Owner role on the
      group.
    </AlertDescription>
  </Alert>
);

type GitLabGroupFieldProps = {
  onGroupChange?: () => void;
};

export const GitLabGroupField = ({ onGroupChange }: GitLabGroupFieldProps) => {
  const { control } = useFormContext<TGitLabTokenRotationForm>();

  const isUpdate = Boolean(useWatch({ control, name: "id" }));
  const connectionId = useWatch({ control, name: "connection.id" });

  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedGroupSearch] = useDebounce(groupSearch, GITLAB_SEARCH_DEBOUNCE_MS);

  const {
    data: groups,
    error: groupsError,
    isFetching: isGroupsFetching
  } = useGitLabConnectionListGroups(
    connectionId,
    debouncedGroupSearch || undefined,
    GITLAB_GROUP_LIST_LIMIT,
    { enabled: Boolean(connectionId) }
  );

  const isGroupSearchPending =
    Boolean(connectionId) && (groupSearch !== debouncedGroupSearch || isGroupsFetching);

  return (
    <Controller
      name="parameters.groupId"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip
            id="gitlab-group-label"
            htmlFor="gitlab-group"
            tooltip="Groups where the connection's user has the Owner role. Search by name to find more."
          >
            Group
          </FieldLabelWithTooltip>
          <Combobox
            id="gitlab-group"
            aria-labelledby="gitlab-group-label"
            isError={Boolean(error)}
            isLoading={isGroupSearchPending}
            loadingMessage="Loading GitLab groups..."
            isDisabled={!connectionId || isUpdate}
            value={value || null}
            onValueChange={(option) => {
              if (!option || option === value) return;
              onChange(option);
              onGroupChange?.();
            }}
            onClear={() => {
              onChange("");
              onGroupChange?.();
              setGroupSearch("");
            }}
            clearAriaLabel="Clear group"
            onInputValueChange={setGroupSearch}
            shouldFilter={false}
            includeMissingSelectedOptions={!groupSearch && !groupsError}
            options={(groups ?? []).map((group) => group.id)}
            placeholder="Search for a group..."
            getOptionLabel={(id) => groups?.find((group) => group.id === id)?.fullPath ?? id}
            renderOption={(id) => {
              const group = groups?.find((option) => option.id === id);
              return group ? renderGroupOption(group) : id;
            }}
            getOptionValue={(id) => id}
            emptyMessage={(inputValue) => {
              if (groupsError) return "Unable to load GitLab groups. Try again.";
              return inputValue ? "No groups match your search." : "No groups found.";
            }}
            modal
          />
          {(isUpdate || error?.message) && (
            <FieldFeedback
              description={isUpdate ? "Cannot be updated." : undefined}
              error={error?.message}
            />
          )}
        </Field>
      )}
    />
  );
};

type GitLabTokenSettingsFieldsProps = {
  scopes: GitLabTokenScope[];
};

export const GitLabTokenSettingsFields = ({ scopes }: GitLabTokenSettingsFieldsProps) => {
  const { control } = useFormContext<TGitLabTokenRotationForm>();

  return (
    <>
      <Controller
        name="parameters.name"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="gitlab-token-name"
              tooltip="A timestamp is appended so each rotated token is distinct."
            >
              Token Name
            </FieldLabelWithTooltip>
            <Input
              {...field}
              id="gitlab-token-name"
              placeholder="infisical-rotated-token"
              maxLength={GITLAB_TOKEN_NAME_MAX_LENGTH}
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="parameters.description"
        control={control}
        render={({ field: { value, ...field }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip htmlFor="gitlab-token-description">
              Token Description
            </FieldLabelWithTooltip>
            <Input
              {...field}
              value={value ?? ""}
              id="gitlab-token-description"
              placeholder="Optional"
              maxLength={GITLAB_TOKEN_DESCRIPTION_MAX_LENGTH}
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="parameters.scopes"
        control={control}
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip id="gitlab-token-scopes-label" htmlFor="gitlab-token-scopes">
              Scopes
            </FieldLabelWithTooltip>
            <Combobox
              multiple
              id="gitlab-token-scopes"
              aria-labelledby="gitlab-token-scopes-label"
              options={scopes}
              placeholder="Select scopes..."
              getOptionLabel={(scope) => scope}
              getOptionValue={(scope) => scope}
              value={value ?? []}
              onBlur={onBlur}
              onValueChange={onChange}
              isError={Boolean(error)}
              modal
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
    </>
  );
};
