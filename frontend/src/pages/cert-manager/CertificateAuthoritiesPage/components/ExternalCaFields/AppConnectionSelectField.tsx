import { ReactNode, useId } from "react";
import { Control, FieldPath, useController } from "react-hook-form";
import { Info } from "lucide-react";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import {
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { useConnectionCreation } from "../CaInstallCertModal/useConnectionCreation";
import { FormData } from "./schema";

type AppConnectionValue = { id: string; name: string };

const CONNECTION_APPS: Partial<Record<FieldPath<FormData>, AppConnection>> = {
  "configuration.adcsConnection": AppConnection.ADCS,
  "configuration.azureAdcsConnection": AppConnection.AzureADCS,
  "configuration.awsConnection": AppConnection.AWS,
  "configuration.dnsConnection": AppConnection.AWS,
  "configuration.digicertConnection": AppConnection.DigiCert,
  "configuration.godaddyConnection": AppConnection.GoDaddy,
  "configuration.venafiTppConnection": AppConnection.VenafiTpp
};

type Props = {
  control: Control<FormData>;
  name: FieldPath<FormData>;
  label: string;
  tooltip: ReactNode;
  options: TAvailableAppConnection[];
  isLoading: boolean;
  required?: boolean;
  onAfterChange?: () => void;
  createApp?: AppConnection;
};

export const AppConnectionSelectField = ({
  control,
  name,
  label,
  tooltip,
  options,
  isLoading,
  required,
  onAfterChange,
  createApp
}: Props) => {
  const inputId = useId();
  const {
    field: { value, onChange, onBlur, ref },
    fieldState: { error }
  } = useController({ control, name });

  const connectionCreation = useConnectionCreation(
    createApp ?? CONNECTION_APPS[name],
    (connection) => {
      onChange({ id: connection.id, name: connection.name });
      onAfterChange?.();
    }
  );

  return (
    <Field className="mb-4">
      <FieldLabel htmlFor={inputId}>
        {label} {required && <span className="text-danger">*</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Info />
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
        </Tooltip>
      </FieldLabel>
      <Combobox<AppConnectionValue & { projectId?: string | null }>
        id={inputId}
        isClearable={false}
        includeMissingSelectedOptions={false}
        name={name}
        onBlur={onBlur}
        ref={ref}
        value={
          options.find((option) => option.id === (value as AppConnectionValue)?.id) ??
          ((value as AppConnectionValue)?.id ? (value as AppConnectionValue) : null)
        }
        onValueChange={(newValue) => {
          onChange(newValue);
          onAfterChange?.();
        }}
        isLoading={isLoading}
        options={options}
        placeholder="Select connection..."
        getOptionLabel={(option) => option.name}
        getOptionValue={(option) => option.id}
        renderOption={(option) => <AppConnectionOptionContent data={option} />}
        creation={connectionCreation}
        isError={Boolean(error)}
      />
      <FieldError errors={[error]} />
    </Field>
  );
};
