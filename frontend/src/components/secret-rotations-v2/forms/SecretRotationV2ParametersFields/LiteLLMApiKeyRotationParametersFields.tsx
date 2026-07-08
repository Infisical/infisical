import { useEffect, useState } from "react";
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
import { useDebounce } from "@app/hooks";
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

type LiteLLMOption = { id: string; name: string };

/**
 * Resolves the option to display for a stored id. Because the list is fetched with
 * server-side search, the selected record may not be in the current page, so we fall
 * back to the locally-captured selection, then to a bare id so the field never blanks.
 */
const resolveSelectedOption = <T extends LiteLLMOption>(
  options: T[] | undefined,
  selected: T | null,
  id: string | undefined
): T | null => {
  if (!id) return null;
  if (selected?.id === id) return selected;
  return options?.find((option) => option.id === id) ?? ({ id, name: id } as T);
};

/** Ensures the selected option is present in the list so its label always renders. */
const withSelectedOption = <T extends LiteLLMOption>(
  options: T[] | undefined,
  selected: T | null
): T[] => {
  const base = options ?? [];
  if (selected && !base.some((option) => option.id === selected.id)) {
    return [selected, ...base];
  }
  return base;
};

export const LiteLLMApiKeyRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.LiteLLMApiKey;
    }
  >();

  const connectionId = watch("connection.id");
  const userId = watch("parameters.userId");
  const teamId = watch("parameters.teamId");

  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch] = useDebounce(userSearch);
  const [selectedUser, setSelectedUser] = useState<TLiteLLMUser | null>(null);

  const [teamSearch, setTeamSearch] = useState("");
  const [debouncedTeamSearch] = useDebounce(teamSearch);
  const [selectedTeam, setSelectedTeam] = useState<TLiteLLMTeam | null>(null);

  const { data: users, isFetching: isUsersFetching } = useListLiteLLMConnectionUsers(
    connectionId,
    debouncedUserSearch.trim(),
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: teams, isFetching: isTeamsFetching } = useListLiteLLMConnectionTeams(
    connectionId,
    debouncedTeamSearch.trim(),
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: models, isPending: isModelsPending } = useListLiteLLMConnectionModels(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  // Seed the locally-captured selection from fetched records (e.g. when editing an
  // existing rotation) so the label survives even after the search list changes.
  useEffect(() => {
    if (userId && selectedUser?.id !== userId) {
      const match = users?.find((user) => user.id === userId);
      if (match) setSelectedUser(match);
    }
  }, [users, userId, selectedUser]);

  useEffect(() => {
    if (teamId && selectedTeam?.id !== teamId) {
      const match = teams?.find((team) => team.id === teamId);
      if (match) setSelectedTeam(match);
    }
  }, [teams, teamId, selectedTeam]);

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
          render={({ field: { value, onChange }, fieldState: { error } }) => {
            const selectedValue = resolveSelectedOption(users, selectedUser, value);
            return (
              <FormControl
                isOptional
                isError={Boolean(error)}
                errorText={error?.message}
                label="User"
                tooltipText="Associate the generated key with a LiteLLM user. Search by email."
              >
                <FilterableSelect
                  isClearable
                  isLoading={
                    (userSearch !== debouncedUserSearch || isUsersFetching) && Boolean(connectionId)
                  }
                  isDisabled={!connectionId}
                  value={selectedValue}
                  onChange={(option) => {
                    const newValue = (option as SingleValue<TLiteLLMUser>) ?? null;
                    setSelectedUser(newValue);
                    onChange(newValue?.id);
                  }}
                  options={withSelectedOption(users, selectedValue)}
                  filterOption={() => true}
                  onInputChange={(newSearch, meta) => {
                    if (meta.action === "input-change") setUserSearch(newSearch);
                  }}
                  placeholder="Search for a user..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                />
              </FormControl>
            );
          }}
        />
        <Controller
          name="parameters.teamId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => {
            const selectedValue = resolveSelectedOption(teams, selectedTeam, value);
            return (
              <FormControl
                isOptional
                isError={Boolean(error)}
                errorText={error?.message}
                label="Team"
                tooltipText="Associate the generated key with a LiteLLM team. Search by team alias."
              >
                <FilterableSelect
                  isClearable
                  isLoading={
                    (teamSearch !== debouncedTeamSearch || isTeamsFetching) && Boolean(connectionId)
                  }
                  isDisabled={!connectionId}
                  value={selectedValue}
                  onChange={(option) => {
                    const newValue = (option as SingleValue<TLiteLLMTeam>) ?? null;
                    setSelectedTeam(newValue);
                    onChange(newValue?.id);
                  }}
                  options={withSelectedOption(teams, selectedValue)}
                  filterOption={() => true}
                  onInputChange={(newSearch, meta) => {
                    if (meta.action === "input-change") setTeamSearch(newSearch);
                  }}
                  placeholder="Search for a team..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
                />
              </FormControl>
            );
          }}
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
              tooltipText="Common fields: max_budget (number), tpm_limit / rpm_limit (numbers), metadata (object). user_id, team_id and models are set on the general tab; key_alias, auto_rotate, rotation_interval, duration, send_invite_email and key_type are managed by Infisical and cannot be set here."
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
