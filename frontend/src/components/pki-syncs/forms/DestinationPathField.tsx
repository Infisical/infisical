import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
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
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type Props = {
  label: string;
  tooltip: ReactNode;
  placeholder: string;
};

export const DestinationPathField = ({ label, tooltip, placeholder }: Props) => {
  const { control } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.LinuxServer | PkiSync.WindowsServer }
  >();

  return (
    <>
      <PkiSyncConnectionField />
      <Controller
        name="destinationConfig.destinationPath"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              {label}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              value={value ?? ""}
              onChange={onChange}
              placeholder={placeholder}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
