import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH } from "@app/components/secret-rotations-v2/forms/schemas/openai-service-account-rotation-schema";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, FilterableSelect, Input } from "@app/components/v3";
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
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="openai-project"
              tooltip="The OpenAI project to create service accounts in. This cannot be changed after the rotation is created."
            >
              Project
            </FieldLabelWithTooltip>
            <FilterableSelect
              inputId="openai-project"
              isLoading={isProjectsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects?.find((project) => project.id === value) ?? null}
              onBlur={onBlur}
              onChange={(option) => {
                onChange((option as SingleValue<TOpenAIProject>)?.id ?? "");
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="parameters.name"
        control={control}
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="openai-service-account-name"
              tooltip="A descriptive name for the generated service account. This will be saved in the OpenAI dashboard for reference with a suffix of the timestamp of the service account creation."
            >
              Service Account Name
            </FieldLabelWithTooltip>
            <Input
              ref={ref}
              id="openai-service-account-name"
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="OpenAI Service Account Name"
              maxLength={OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH}
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
    </>
  );
};
