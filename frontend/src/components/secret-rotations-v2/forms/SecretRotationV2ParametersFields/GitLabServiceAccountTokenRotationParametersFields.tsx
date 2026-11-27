import { Controller, useFormContext, useWatch } from "react-hook-form";
import axios from "axios";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Combobox, Field, FieldFeedback } from "@app/components/v3";
import {
  TGitLabServiceAccount,
  useGitLabConnectionListGroupServiceAccounts
} from "@app/hooks/api/appConnections/gitlab";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { GitLabTokenScope } from "@app/hooks/api/secretRotationsV2/types/gitlab-service-account-token-rotation";

import { GitLabGroupField, GitLabTokenConnectionAlert, GitLabTokenSettingsFields } from "./shared";

const GITLAB_TOKEN_SCOPES = Object.values(GitLabTokenScope);

const renderServiceAccountOption = (serviceAccount: TGitLabServiceAccount) => (
  <div className="min-w-0">
    <p className="truncate">{serviceAccount.name}</p>
    <p className="truncate text-xs leading-4 text-muted">@{serviceAccount.username}</p>
  </div>
);

export const GitLabServiceAccountTokenRotationParametersFields = () => {
  const { control, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.GitLabServiceAccountToken;
    }
  >();

  const isUpdate = Boolean(useWatch({ control, name: "id" }));
  const connectionId = useWatch({ control, name: "connection.id" });
  const groupId = useWatch({ control, name: "parameters.groupId" });

  const {
    data: serviceAccounts,
    error: serviceAccountsError,
    isFetching: isServiceAccountsFetching
  } = useGitLabConnectionListGroupServiceAccounts(connectionId, groupId, {
    enabled: Boolean(connectionId && groupId)
  });

  const serviceAccountsErrorMessage = axios.isAxiosError(serviceAccountsError)
    ? ((serviceAccountsError.response?.data as { message?: string } | undefined)?.message ??
      "Unable to load service accounts. Try again.")
    : null;

  return (
    <>
      <GitLabTokenConnectionAlert />
      <GitLabGroupField
        onGroupChange={() => setValue("parameters.serviceAccountId", "", { shouldValidate: false })}
      />
      <Controller
        name="parameters.serviceAccountId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              id="gitlab-service-account-label"
              htmlFor="gitlab-service-account"
            >
              Service Account
            </FieldLabelWithTooltip>
            <Combobox
              id="gitlab-service-account"
              aria-labelledby="gitlab-service-account-label"
              isError={Boolean(error)}
              isLoading={isServiceAccountsFetching}
              loadingMessage="Loading service accounts..."
              isDisabled={!groupId || isUpdate}
              value={serviceAccounts?.find((account) => account.id === value) ?? null}
              onValueChange={(option) => onChange(option?.id ?? "")}
              options={serviceAccounts ?? []}
              placeholder="Select a service account..."
              getOptionLabel={(account) => account.name}
              getOptionValue={(account) => account.id}
              getOptionKeywords={(account) => [account.username]}
              renderOption={renderServiceAccountOption}
              emptyMessage={serviceAccountsErrorMessage ?? "This group has no service accounts."}
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
      <GitLabTokenSettingsFields scopes={GITLAB_TOKEN_SCOPES} />
    </>
  );
};
