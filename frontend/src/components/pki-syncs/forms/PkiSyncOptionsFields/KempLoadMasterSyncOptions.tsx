import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { KEMP_DEFAULT_CA_NAME_SCHEMA } from "../schemas/kemp-loadmaster-pki-sync-destination-schema";
import { TPkiSyncForm } from "../schemas/pki-sync-schema";
import { PreserveItemOnRenewalField } from "./PreserveItemOnRenewalField";

export const KempLoadMasterSyncOptions = () => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const { syncOption } = usePkiSyncOption(watch("destination"));

  return (
    <>
      <PreserveItemOnRenewalField
        label="Preserve Certificate on Renewal"
        description="Applies to certificate renewals only. When enabled, the renewed certificate keeps the original certificate's identifier and replaces that entry in place, so any Virtual Service binding keeps working. When disabled, the renewed certificate is imported under a newly generated identifier and the original stays on the LoadMaster."
      />
      <Controller
        control={control}
        name="syncOptions.caCertificateNameSchema"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              CA Certificate Name Schema
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <div className="flex flex-col gap-3">
                    <span>
                      This schema names each CA (intermediate) certificate that Infisical pushes
                      into the LoadMaster&apos;s Intermediate Certs store.
                    </span>
                    <div className="flex flex-col">
                      <span>Available placeholders:</span>
                      <ul className="list-disc pl-4 text-sm">
                        <li>
                          <code>{"{{fingerprint}}"}</code> - A hash of the CA certificate. Include
                          it so each distinct CA gets a unique name and is never duplicated.
                        </li>
                        <li>
                          <code>{"{{commonName}}"}</code> - The CA certificate&apos;s common name
                        </li>
                      </ul>
                      <span className="mt-1 text-xs text-muted">
                        A placeholder is optional. A schema with no placeholder resolves to a fixed
                        name and can hold only one CA certificate. When placeholders resolve, any
                        characters the destination doesn&apos;t support are replaced with hyphens.
                      </span>
                    </div>
                    {syncOption?.forbiddenCharacters &&
                      syncOption.forbiddenCharacters.length > 0 && (
                        <div className="flex flex-col">
                          <span className="text-warning">
                            Character restrictions for {syncOption.name}:
                          </span>
                          <div className="text-xs text-muted">
                            The following characters are not allowed:{" "}
                            {syncOption.forbiddenCharacters.split("").join(" ")}
                          </div>
                        </div>
                      )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={KEMP_DEFAULT_CA_NAME_SCHEMA}
              isError={Boolean(error)}
            />
            <FieldDescription>
              Controls how CA (intermediate) certificates are named in the LoadMaster&apos;s
              Intermediate Certs store.
            </FieldDescription>
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
