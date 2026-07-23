import { Control, Controller } from "react-hook-form";
import { Info } from "lucide-react";

import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared/AwsRegionSelect";
import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { FormData } from "./schema";

type Props = {
  control: Control<FormData>;
  availableConnections: TAvailableAppConnection[];
  isPending: boolean;
};

export const AwsAcmPublicCaFields = ({ control, availableConnections, isPending }: Props) => (
  <>
    <AppConnectionSelectField
      control={control}
      name="configuration.awsConnection"
      label="AWS Connection"
      required
      options={availableConnections}
      isLoading={isPending}
      tooltip="AWS App Connection used to issue, export, renew, and revoke certificates via AWS Certificate Manager (ACM)."
    />
    <AppConnectionSelectField
      control={control}
      name="configuration.dnsConnection"
      label="Route 53 Connection"
      required
      options={availableConnections}
      isLoading={isPending}
      tooltip="AWS App Connection used to write the ACM CNAME validation records into Route 53."
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.hostedZoneId"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Route 53 Hosted Zone ID <span className="text-danger">*</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                The Route 53 hosted zone that owns the domain(s) you&apos;ll issue certificates for.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <Input {...field} placeholder="Z040441124N1GOOMCQYX1" isError={Boolean(error)} />
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
