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

export const AdcsFields = ({ control, availableConnections, isPending }: Props) => (
  <>
    <AppConnectionSelectField
      control={control}
      name="configuration.adcsConnection"
      label="ADCS Connection"
      required
      menuPlacement="top"
      options={availableConnections}
      isLoading={isPending}
      tooltip="ADCS App Connection contains the Windows domain credentials and Gateway used to reach the AD CS server."
    />
    <Controller
      control={control}
      defaultValue=""
      name="configuration.caName"
      render={({ field, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Certificate Authority <span className="text-muted">(optional)</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                The AD CS certificate authority name (the CA&apos;s common name), e.g. corp-ca01-CA.
                Leave blank to discover it automatically from the CA host.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <Input {...field} placeholder="Auto-discovered if left blank" isError={Boolean(error)} />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  </>
);
