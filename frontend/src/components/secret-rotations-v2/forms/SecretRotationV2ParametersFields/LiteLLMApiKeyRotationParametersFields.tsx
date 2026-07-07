import { Controller, useFormContext } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import {
  FilterableSelect,
  FormControl,
  Input,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea
} from "@app/components/v2";
import {
  useListLiteLLMConnectionModels,
  useListLiteLLMConnectionTeams,
  useListLiteLLMConnectionUsers
} from "@app/hooks/api/appConnections/litellm";
import {
  TLiteLLMModel,
  TLiteLLMTeam,
  TLiteLLMUser
} from "@app/hooks/api/appConnections/litellm/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

/** Max length for the key name (matches backend schema). */
const LITELLM_API_KEY_NAME_MAX_LENGTH = 100;

/** Starter set of common LiteLLM key options; users can edit or clear these. Must be valid JSON. */
const DEFAULT_LITELLM_OPTIONS = `{
  "max_budget": null,
  "tpm_limit": null,
  "rpm_limit": null,
  "metadata": {}
}`;

enum ParameterTab {
  General = "general",
  Advanced = "advanced"
}

export const LiteLLMApiKeyRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.LiteLLMApiKey;
    }
  >();

  const connectionId = watch("connection.id");
  const userId = watch("parameters.userId");

  const { data: users, isPending: isUsersPending } = useListLiteLLMConnectionUsers(connectionId, {
    enabled: Boolean(connectionId)
  });

  const { data: teams, isPending: isTeamsPending } = useListLiteLLMConnectionTeams(
    connectionId,
    userId,
    {
      enabled: Boolean(connectionId && userId)
    }
  );

  const { data: models, isPending: isModelsPending } = useListLiteLLMConnectionModels(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <Tabs defaultValue={ParameterTab.General}>
      <TabList className="border-b border-mineshaft-500">
        <Tab value={ParameterTab.General}>General</Tab>
        <Tab value={ParameterTab.Advanced}>Advanced</Tab>
      </TabList>
      <TabPanel value={ParameterTab.General}>
        <Controller
          name="parameters.name"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Key Name"
              tooltipText="A descriptive name for the generated key. Infisical appends a timestamp so each rotated key stays unique and records its creation time."
            >
              <Input
                value={value}
                onChange={onChange}
                placeholder="my-rotated-key"
                maxLength={LITELLM_API_KEY_NAME_MAX_LENGTH}
              />
            </FormControl>
          )}
        />
        <Controller
          name="parameters.userId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isOptional
              isError={Boolean(error)}
              errorText={error?.message}
              label="User"
              tooltipText="Associate the generated key with a LiteLLM user."
            >
              <FilterableSelect
                isClearable
                isLoading={isUsersPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={users?.find((user) => user.id === value) ?? null}
                onChange={(option) => {
                  onChange((option as SingleValue<TLiteLLMUser>)?.id);
                  // Teams are scoped to the selected user, so reset the team when the user changes.
                  setValue("parameters.teamId", undefined);
                }}
                options={users}
                placeholder="Select a user..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
        <Controller
          name="parameters.teamId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isOptional
              isError={Boolean(error)}
              errorText={error?.message}
              label="Team"
              tooltipText="Associate the generated key with a team the selected user belongs to. Select a user first."
            >
              <FilterableSelect
                isClearable
                isLoading={isTeamsPending && Boolean(connectionId && userId)}
                isDisabled={!connectionId || !userId}
                value={teams?.find((team) => team.id === value) ?? null}
                onChange={(option) => onChange((option as SingleValue<TLiteLLMTeam>)?.id)}
                options={teams}
                placeholder={userId ? "Select a team..." : "Select a user first"}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
        <Controller
          name="parameters.models"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isOptional
              isError={Boolean(error)}
              errorText={error?.message}
              label="Models"
              tooltipText="Restrict the generated key to specific models. Leave empty to allow all models."
            >
              <FilterableSelect
                isMulti
                isLoading={isModelsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={models?.filter((model) => (value ?? []).includes(model.id)) ?? []}
                onChange={(option) => {
                  onChange((option as MultiValue<TLiteLLMModel>).map((model) => model.id));
                }}
                options={models}
                placeholder="Select models..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
      </TabPanel>
      <TabPanel value={ParameterTab.Advanced}>
        <Controller
          name="parameters.additionalOptions"
          control={control}
          defaultValue={DEFAULT_LITELLM_OPTIONS}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isOptional
              isError={Boolean(error)}
              errorText={error?.message}
              label="Additional Key Options (JSON)"
              tooltipText="Common fields: max_budget (number), tpm_limit / rpm_limit (numbers), metadata (object). user_id, team_id and models are set via the fields above; key_alias, auto_rotate, rotation_interval, duration, send_invite_email and key_type are managed by Infisical and cannot be set here."
            >
              <TextArea
                {...field}
                reSize="none"
                rows={10}
                placeholder={DEFAULT_LITELLM_OPTIONS}
                className="border-mineshaft-600 bg-mineshaft-900 font-mono text-sm"
              />
            </FormControl>
          )}
        />
      </TabPanel>
    </Tabs>
  );
};
