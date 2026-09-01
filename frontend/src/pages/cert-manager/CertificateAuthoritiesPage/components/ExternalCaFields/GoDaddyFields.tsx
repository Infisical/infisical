import { Control, Controller } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { GoDaddyProductType } from "@app/hooks/api/ca";

import { AppConnectionSelectField } from "./AppConnectionSelectField";
import { FormData } from "./schema";

type Props = {
  control: Control<FormData>;
  availableConnections: TAvailableAppConnection[];
  isPending: boolean;
};

export const GoDaddyFields = ({ control, availableConnections, isPending }: Props) => (
  <>
    <AppConnectionSelectField
      control={control}
      name="configuration.godaddyConnection"
      label="GoDaddy Connection"
      options={availableConnections}
      isLoading={isPending}
      tooltip="GoDaddy App Connection provides the API key and secret used to place certificate orders."
    />
    <Controller
      control={control}
      name="configuration.productType"
      defaultValue={GoDaddyProductType.DV_SSL}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Product <span className="text-danger">*</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                Domain Validated SSL product to use for issuance.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <Select value={value} onValueChange={(val) => onChange(val)}>
            <SelectTrigger className="w-full" isError={Boolean(error)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={GoDaddyProductType.DV_SSL}>DV SSL</SelectItem>
            </SelectContent>
          </Select>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  </>
);
