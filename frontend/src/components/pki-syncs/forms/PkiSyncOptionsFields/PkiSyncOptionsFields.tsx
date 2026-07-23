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
import { PkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";
import { AwsCertificateManagerSyncOptions } from "./AwsCertificateManagerSyncOptions";
import { AwsElasticLoadBalancerSyncOptions } from "./AwsElasticLoadBalancerSyncOptions";
import { AwsSecretsManagerSyncOptions } from "./AwsSecretsManagerSyncOptions";
import { AzureKeyVaultSyncOptions } from "./AzureKeyVaultSyncOptions";
import { ChefSyncOptions } from "./ChefSyncOptions";
import { F5BigIpSyncOptions } from "./F5BigIpSyncOptions";
import { KempLoadMasterSyncOptions } from "./KempLoadMasterSyncOptions";
import { LinuxServerSyncOptions } from "./LinuxServerSyncOptions";
import { NetScalerSyncOptions } from "./NetScalerSyncOptions";
import { SyncSwitchField } from "./SyncSwitchField";
import { WindowsServerSyncOptions } from "./WindowsServerSyncOptions";

type Props = {
  destination?: PkiSync;
  isUpdate?: boolean;
};

const renderDestinationOptions = (currentDestination: PkiSync, isUpdate?: boolean) => {
  switch (currentDestination) {
    case PkiSync.AwsCertificateManager:
      return <AwsCertificateManagerSyncOptions />;
    case PkiSync.AwsElasticLoadBalancer:
      return <AwsElasticLoadBalancerSyncOptions />;
    case PkiSync.AzureKeyVault:
      return <AzureKeyVaultSyncOptions />;
    case PkiSync.AwsSecretsManager:
      return <AwsSecretsManagerSyncOptions />;
    case PkiSync.Chef:
      return <ChefSyncOptions />;
    case PkiSync.NetScaler:
      return <NetScalerSyncOptions />;
    case PkiSync.F5BigIp:
      return <F5BigIpSyncOptions />;
    case PkiSync.KempLoadMaster:
      return <KempLoadMasterSyncOptions />;
    case PkiSync.LinuxServer:
      return <LinuxServerSyncOptions isUpdate={isUpdate} />;
    case PkiSync.WindowsServer:
      return <WindowsServerSyncOptions isUpdate={isUpdate} />;
    default:
      return null;
  }
};

export const PkiSyncOptionsFields = ({ destination, isUpdate }: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const currentDestination = destination || watch("destination");
  const { syncOption } = usePkiSyncOption(currentDestination);

  return (
    <>
      {syncOption?.canRemoveCertificates && (
        <SyncSwitchField
          name="syncOptions.canRemoveCertificates"
          id="can-remove-certificates"
          label="Enable Removal of Expired/Revoked Certificates"
          description={
            <>
              When enabled, Infisical removes certificates from the destination during a sync once
              they are no longer active in Infisical. Disable this if you manage some certificates
              manually outside of Infisical.
              {currentDestination === PkiSync.AwsElasticLoadBalancer &&
                " For AWS Elastic Load Balancer, this removes the certificate from both the load balancer listeners and AWS Certificate Manager, affecting only certificates managed by this sync."}
            </>
          }
        />
      )}

      {currentDestination !== PkiSync.CloudflareCustomCertificate &&
        currentDestination !== PkiSync.NutanixPrismCentral && (
          <SyncSwitchField
            name="syncOptions.includeRootCa"
            id="include-root-ca"
            label="Include Root CA in Certificate Chain"
            description="When enabled, the full certificate chain including the root CA is synced. When disabled, the root CA is excluded to reduce the chain size; most applications validate correctly with intermediate certificates only."
          />
        )}

      {renderDestinationOptions(currentDestination, isUpdate)}

      {currentDestination !== PkiSync.NutanixPrismCentral && (
        <Controller
          control={control}
          name="syncOptions.certificateNameSchema"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Certificate Name Schema
                {currentDestination === PkiSync.AwsElasticLoadBalancer && (
                  <span className="text-muted">(optional)</span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    <div className="flex flex-col gap-3">
                      <span>
                        When a certificate is synced, the certificate name schema will be applied
                        before it reaches the destination.
                      </span>

                      <div className="flex flex-col">
                        <span>Available placeholders:</span>
                        <ul className="list-disc pl-4 text-sm">
                          <li>
                            <code>{"{{certificateId}}"}</code> - The unique ID of the certificate
                          </li>
                          <li>
                            <code>{"{{shortCertificateId}}"}</code> - A shorter (22-character) form
                            of the certificate ID. Use it instead of{" "}
                            <code>{"{{certificateId}}"}</code> when the destination&apos;s name
                            limit is tight (e.g. NetScaler&apos;s 63 characters).
                          </li>
                          <li>
                            <code>{"{{commonName}}"}</code> - The certificate&apos;s common name
                            (FQDN)
                          </li>
                          <li>
                            <code>{"{{profileId}}"}</code> - The certificate profile ID (falls back
                            to the certificate ID when none is set)
                          </li>
                          <li>
                            <code>{"{{applicationId}}"}</code> - The ID of the application the sync
                            belongs to
                          </li>
                          <li>
                            <code>{"{{applicationName}}"}</code> - The name of the application the
                            sync belongs to
                          </li>
                        </ul>
                        {currentDestination === PkiSync.LinuxServer ||
                        currentDestination === PkiSync.WindowsServer ? (
                          <span className="mt-1 text-xs text-muted">
                            A placeholder is optional here. Include one (for example{" "}
                            <code>{"{{commonName}}"}</code>) so each certificate resolves to a
                            distinct file name. A schema with no placeholder resolves to a fixed
                            name and can be linked to only one certificate. When placeholders
                            resolve, any characters the destination doesn&apos;t support are
                            replaced with hyphens.
                          </span>
                        ) : (
                          <span className="mt-1 text-xs text-muted">
                            The schema must include <code>{"{{certificateId}}"}</code> or{" "}
                            <code>{"{{shortCertificateId}}"}</code> so each certificate gets a
                            unique name. The template itself can only contain letters, numbers, and
                            the separators allowed by the destination. When placeholders resolve,
                            any characters the destination doesn&apos;t support are replaced with
                            hyphens.
                          </span>
                        )}
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
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                placeholder={
                  syncOption?.defaultCertificateNameSchema || "INFISICAL_{{certificateId}}"
                }
                isError={Boolean(error)}
              />
              <FieldDescription>
                {currentDestination === PkiSync.AwsElasticLoadBalancer
                  ? "Set a Certificate Name Schema so Infisical only manages the specific certificates you intend to, keeping everything else untouched."
                  : "The Certificate Name Schema ensures Infisical only manages the specific certificates you intend to, keeping everything else untouched."}
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
    </>
  );
};
