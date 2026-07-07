import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH } from "@app/components/secret-rotations-v2/forms/schemas/openai-service-account-rotation-schema";
import { FilterableSelect, FormControl, Input } from "@app/components/v2";
import { useListOpenAIConnectionProjects } from "@app/hooks/api/appConnections/openai";
import { TOpenAIProject } from "@app/hooks/api/appConnections/openai/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const OpenAIServiceAccountRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OpenAIServiceAccount;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: projects, isPending: isProjectsPending } = useListOpenAIConnectionProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <Controller
        name="parameters.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project"
            tooltipText="The OpenAI project to create service accounts in. This cannot be changed after the rotation is created."
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isProjectsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects?.find((project) => project.id === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<TOpenAIProject>)?.id ?? "");
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />
      <Controller
        name="parameters.name"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Service Account Name"
            tooltipText="A descriptive name for the generated service account. This will be saved in the OpenAI dashboard for reference with a suffix of the timestamp of the service account creation."
          >
            <Input
              value={value}
              onChange={onChange}
              placeholder="OpenAI Service Account Name"
              maxLength={OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH}
            />
          </FormControl>
        )}
      />
    </>
  );
};
