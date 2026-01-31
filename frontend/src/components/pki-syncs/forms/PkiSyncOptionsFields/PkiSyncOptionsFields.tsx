import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Input, Switch, Tooltip } from "@app/components/v2";
import { PkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";

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
                Enable Removal of Expired/Revoked Certificates{" "}
                <Tooltip
                  className="max-w-md"
                  content={
                    <>
                      <p>
                        When enabled, Infisical will remove certificates from the destination during
                        a sync if they are no longer active in Infisical.
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

      {currentDestination !== PkiSync.CloudflareCustomCertificate && (
        <Controller
          control={control}
          name="syncOptions.includeRootCa"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="include-root-ca"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p>
                  Include Root CA in Certificate Chain{" "}
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        <p>
                          When enabled, the full certificate chain including the root CA will be
                          synced to the destination.
                        </p>
                        <p className="mt-4">
                          When disabled, the root CA will be excluded from the certificate chain
                          during sync operations, reducing the size of the synced certificate chain.
                        </p>
                        <p className="mt-4">
                          Most applications and services work correctly with intermediate
                          certificates only, as they can validate the trust chain up to a root CA
                          they already trust.
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
      )}

      {currentDestination === PkiSync.AwsCertificateManager && (
        <Controller
          control={control}
          name="syncOptions.preserveArn"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="preserve-arn"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p>
                  Preserve ARN on Renewal{" "}
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        <p>
                          When enabled, Infisical will replace the contents of existing certificates
                          while preserving the same ARN during certificate renewal syncs.
                        </p>
                        <p className="mt-4">
                          This allows consuming services like load balancers to continue using the
                          same ARN without requiring manual updates.
                        </p>
                        <p className="mt-4">
                          When disabled, new certificates will be created with new ARNs, and old
                          certificates will be removed.
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
      )}

      {currentDestination === PkiSync.AzureKeyVault && (
        <Controller
          control={control}
          name="syncOptions.enableVersioning"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="preserve-version"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p>
                  Enable Versioning on Renewal{" "}
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        <p>
                          When enabled, Infisical will create a new version of the existing
                          certificate in Azure Key Vault during certificate renewal syncs,
                          preserving the original certificate name.
                        </p>
                        <p className="mt-4">
                          This allows consuming services to continue using the same certificate name
                          while automatically using the latest version without requiring manual
                          updates.
                        </p>
                        <p className="mt-4">
                          When disabled, new certificates will be created with new names, and old
                          certificates will be removed.
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
      )}

      {currentDestination === PkiSync.AwsSecretsManager && (
        <Controller
          control={control}
          name="syncOptions.preserveSecretOnRenewal"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="preserve-secret-on-renewal"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p>
                  Preserve Secret on Renewal{" "}
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        <p>
                          <strong>Only applies to certificate renewals:</strong> When a certificate
                          is renewed in Infisical, this option controls how the renewed certificate
                          is handled in AWS Secrets Manager.
                        </p>
                        <p className="mt-4">
                          When enabled, the renewed certificate will update the existing secret,
                          preserving the same secret name and ARN. This allows consuming services to
                          continue using the same secret reference without requiring updates.
                        </p>
                        <p className="mt-4">
                          When disabled, the renewed certificate will be created as a new secret
                          with a new name, and the old secret will be removed.
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
      )}

      {currentDestination === PkiSync.Chef && (
        <Controller
          control={control}
          name="syncOptions.preserveItemOnRenewal"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="preserve-item-on-renewal"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p>
                  Preserve Data Bag Item on Renewal{" "}
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        <p>
                          <strong>Only applies to certificate renewals:</strong> When a certificate
                          is renewed in Infisical, this option controls how the renewed certificate
                          is handled in Chef.
                        </p>
                        <p className="mt-4">
                          When enabled, the renewed certificate will update the existing data bag
                          item, preserving the same item name. This allows consuming services to
                          continue using the same data bag item without requiring updates to Chef
                          cookbooks or recipes.
                        </p>
                        <p className="mt-4">
                          When disabled, the renewed certificate will be created as a new data bag
                          item with a new name, and the old item will be removed.
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
      )}

      <Controller
        control={control}
        name="syncOptions.certificateNameSchema"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipClassName="max-w-md"
            tooltipText={
              <div className="flex flex-col gap-3">
                <span>
                  When a certificate is synced, the certificate name schema will be applied before
                  it reaches the destination.
                </span>

                <div className="flex flex-col">
                  <span>Available placeholders:</span>
                  <ul className="list-disc pl-4 text-sm">
                    <li>
                      <code>{"{{certificateId}}"}</code> - The unique ID of the certificate
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
                  </div>
                )}
              </div>
            }
            isError={Boolean(error)}
            isOptional
            errorText={error?.message}
            label="Certificate Name Schema"
            helperText="Infisical strongly advises setting a Certificate Name Schema to ensure that Infisical only manages the specific certificates you intend to manage, keeping everything else untouched."
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
