import { ReactNode } from "react";
import { Control, Controller, FieldPath } from "react-hook-form";
import { Info } from "lucide-react";

import { AppConnectionOption } from "@app/components/app-connections";
import {
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";

import { FormData } from "./schema";

type AppConnectionValue = { id: string; name: string };

type Props = {
  control: Control<FormData>;
  name: FieldPath<FormData>;
  label: string;
  tooltip: ReactNode;
  options: TAvailableAppConnection[];
  isLoading: boolean;
  required?: boolean;
  menuPlacement?: "top" | "bottom" | "auto";
};

export const AppConnectionSelectField = ({
  control,
  name,
  label,
  tooltip,
  options,
  isLoading,
  required,
  menuPlacement
}: Props) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { value, onChange }, fieldState: { error } }) => (
      <Field className="mb-4">
        <FieldLabel>
          {label} {required && <span className="text-danger">*</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Info />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
          </Tooltip>
        </FieldLabel>
        <FilterableSelect
          {...(menuPlacement ? { menuPlacement } : {})}
          value={(value as AppConnectionValue)?.id ? (value as AppConnectionValue) : null}
          onChange={(newValue) => onChange(newValue)}
          isLoading={isLoading}
          options={options}
          placeholder="Select connection..."
          getOptionLabel={(option) => option.name}
          getOptionValue={(option) => option.id}
          components={{ Option: AppConnectionOption }}
          isError={Boolean(error)}
        />
        <FieldError errors={[error]} />
      </Field>
    )}
  />
);
