import { Control, Controller } from "react-hook-form";
import { Info } from "lucide-react";

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

export const VenafiTppFields = ({ control, availableConnections, isPending }: Props) => (
  <>
    <AppConnectionSelectField
      control={control}
      name="configuration.venafiTppConnection"
      label="Venafi TPP Connection"
      options={availableConnections}
      isLoading={isPending}
      tooltip="Venafi TPP App Connection contains the credentials to connect to your Venafi Trust Protection Platform instance."
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.policyDN"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Policy DN <span className="text-danger">*</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                The policy folder path in Venafi TPP where certificates will be managed (e.g.,
                \VED\Policy\Certificates).
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <Input {...field} placeholder="\VED\Policy\Certificates" isError={Boolean(error)} />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  </>
);
