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

import { TPkiSyncForm } from "../schemas/pki-sync-schema";
import { ServerExportFormatFields } from "./ServerExportFormatFields";

type Props = {
  isUpdate?: boolean;
};

export const LinuxServerSyncOptions = ({ isUpdate }: Props) => {
  const { control } = useFormContext<TPkiSyncForm>();

  return (
    <>
      <ServerExportFormatFields isUpdate={isUpdate} />
      <div className="grid grid-cols-2 gap-2">
        <Controller
          control={control}
          name="syncOptions.fileMode"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                File Permissions <span className="text-muted">(optional)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Octal mode for the delivered certificate and chain files (default 644).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                value={value ?? ""}
                onChange={onChange}
                placeholder="644"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="syncOptions.privateKeyFileMode"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Private Key Permissions <span className="text-muted">(optional)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Octal mode for the delivered private key file (default 600).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                value={value ?? ""}
                onChange={onChange}
                placeholder="600"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Controller
          control={control}
          name="syncOptions.owner"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Owner <span className="text-muted">(optional)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Owner applied to the delivered files (chown). Requires the connection user to be
                    root or have passwordless sudo.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                value={value ?? ""}
                onChange={onChange}
                placeholder="e.g. root"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="syncOptions.group"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Group <span className="text-muted">(optional)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Group applied to the delivered files (chown). Requires the connection user to be
                    root or have passwordless sudo.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                value={value ?? ""}
                onChange={onChange}
                placeholder="e.g. ssl-cert"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </div>
    </>
  );
};
