import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Switch, Tooltip } from "@app/components/v2";

import { TPkiSyncForm } from "../schemas";

export const PkiSyncOptionsFields = () => {
  const { control } = useFormContext<TPkiSyncForm>();

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
    </>
  );
};
