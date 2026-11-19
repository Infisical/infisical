import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH } from "@app/components/secret-rotations-v2/forms/schemas/gcp-service-account-key-rotation-schema";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldFeedback, Input } from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const GcpServiceAccountKeyRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.GcpServiceAccountKey;
    }
  >();

  const isUpdate = Boolean(watch("id"));

  return (
    <Controller
      name="parameters.serviceAccountEmail"
      control={control}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabelWithTooltip
            htmlFor="gcp-service-account-email"
            tooltip="The service account whose keys will be rotated. The connection's service account needs the Service Account Key Admin role (roles/iam.serviceAccountKeyAdmin) on it."
            tooltipClassName="max-w-sm"
          >
            Service Account Email
          </FieldLabelWithTooltip>
          <Input
            ref={ref}
            id="gcp-service-account-email"
            disabled={isUpdate}
            value={value}
            onBlur={onBlur}
            onChange={onChange}
            placeholder="my-app@my-project.iam.gserviceaccount.com"
            maxLength={GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH}
            isError={Boolean(error)}
            aria-describedby={
              isUpdate || error?.message ? "gcp-service-account-email-feedback" : undefined
            }
          />
          {(isUpdate || error?.message) && (
            <FieldFeedback
              id="gcp-service-account-email-feedback"
              description={isUpdate ? "Cannot be updated." : undefined}
              error={error?.message}
            />
          )}
        </Field>
      )}
    />
  );
};
