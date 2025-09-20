import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Input, Switch, Tooltip } from "@app/components/v2";
import { PkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas";

type Props = {
  destination?: PkiSync;
};

export const PkiSyncOptionsFields = ({ destination }: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const currentDestination = destination || watch("destination");
  const { syncOption } = usePkiSyncOption(currentDestination);

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">Configure how certificates should be synced.</p>
      {/*
      TODO: Re-enable this when we have a way to import certificates
      <Controller
        control={control}
        name="syncOptions.canImportCertificates"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message}>
            <Switch
              className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
              id="can-import-certificates"
              thumbClassName="bg-mineshaft-800"
              onCheckedChange={onChange}
              isChecked={value}
            >
              <p>
                Auto Import Certificates{" "}
                <Tooltip
                  className="max-w-md"
                  content={
                    <>
                      <p>
                        When enabled, Infisical will automatically import certificates from the PKI
                        subscriber to the destination during sync operations.
                      </p>
                      <p className="mt-4">
                        This allows you to automatically populate your destination with certificates
                        issued by your Certificate Authority.
                      </p>
                    </>
                  }
                >
                  <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                </Tooltip>
              </p>
            </Switch>
          </FormControl>
        )}
      />
      */}
      <Controller
        control={control}
        name="syncOptions.canRemoveCertificates"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message}>
            <Switch
              className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
              id="can-remove-certificates"
              thumbClassName="bg-mineshaft-800"
              onCheckedChange={onChange}
              isChecked={value}
            >
              <p>
                Enable Certificate Removal{" "}
                <Tooltip
                  className="max-w-md"
                  content={
                    <>
                      <p>
                        When enabled, Infisical will remove certificates from the destination during
                        a sync if they are no longer managed by Infisical.
                      </p>
                      <p className="mt-4">
                        Disable this option if you intend to manage some certificates manually
                        outside of Infisical.
                      </p>
                    </>
                  }
                >
                  <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                </Tooltip>
              </p>
            </Switch>
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="syncOptions.certificateNameSchema"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipClassName="max-w-md"
            tooltipText={
              <div className="flex flex-col gap-3">
                <span>
                  When a certificate is synced, values will be injected into the certificate name
                  schema before it reaches the destination. This is useful for organization.
                </span>

                <div className="flex flex-col">
                  <span>Available placeholders:</span>
                  <ul className="list-disc pl-4 text-sm">
                    <li>
                      <code>{"{{certificateId}}"}</code> - The unique ID of the certificate
                    </li>
                    <li>
                      <code>{"{{environment}}"}</code> - The environment which the certificate is in
                      (e.g. dev, staging, prod)
                    </li>
                  </ul>
                </div>
                {syncOption?.forbiddenCharacters && syncOption.forbiddenCharacters.length > 0 && (
                  <div className="flex flex-col">
                    <span className="text-yellow">
                      Character restrictions for {syncOption.name}:
                    </span>
                    <div className="text-xs text-bunker-300">
                      The following characters are not allowed:{" "}
                      {syncOption.forbiddenCharacters.split("").join(" ")}
                    </div>
                    {syncOption.allowedCharacterPattern && (
                      <div className="mt-1 text-xs text-bunker-300">
                        Only alphanumeric characters and hyphens are allowed (a-z, A-Z, 0-9, -)
                      </div>
                    )}
                  </div>
                )}
              </div>
            }
            isError={Boolean(error)}
            isOptional
            errorText={error?.message}
            label="Certificate Name Schema"
            helperText="Infisical strongly advises setting a Certificate Name Schema to ensure that Infisical only manages the specific certificates you intend, keeping everything else untouched."
          >
            <Input
              value={value || ""}
              onChange={(e) => onChange(e.target.value || undefined)}
              placeholder={
                syncOption?.defaultCertificateNameSchema || "INFISICAL_{{certificateId}}"
              }
            />
          </FormControl>
        )}
      />
    </>
  );
};
