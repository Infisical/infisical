import { Control, Controller } from "react-hook-form";

import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared/AwsRegionSelect";
import { Field, FieldError, FieldLabel, Input } from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { FormData } from "./schema";

type Props = {
  control: Control<FormData>;
  availableConnections: TAvailableAppConnection[];
  isPending: boolean;
};

export const AwsPcaFields = ({ control, availableConnections, isPending }: Props) => (
  <>
    <AppConnectionSelectField
      control={control}
      name="configuration.awsConnection"
      label="AWS Connection"
      options={availableConnections}
      isLoading={isPending}
      tooltip="AWS App Connection provides the credentials used to communicate with AWS Private Certificate Authority."
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.certificateAuthorityArn"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Certificate Authority ARN <span className="text-danger">*</span>
          </FieldLabel>
          <Input
            {...field}
            placeholder="arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/abc-123"
            isError={Boolean(error)}
          />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.region"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Region <span className="text-danger">*</span>
          </FieldLabel>
          <AwsRegionSelect value={value} onChange={(v) => onChange(v || "")} />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  </>
);
