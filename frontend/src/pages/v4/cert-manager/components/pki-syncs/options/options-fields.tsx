import { Code } from "@infisical/cipher/ui/code";

import {
  CERTIFICATE_NAME_SCHEMA_UNSUPPORTED_DESTINATIONS,
  INCLUDE_ROOT_CA_UNSUPPORTED_DESTINATIONS
} from "@app/helpers/pkiSyncs";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { TextField, useWatchedValue } from "../fields";
import { usePkiSyncOption } from "../shared";
import {
  AwsCertificateManagerSyncOptions,
  AwsElasticLoadBalancerSyncOptions,
  AwsSecretsManagerSyncOptions,
  AzureKeyVaultSyncOptions,
  ChefSyncOptions,
  CloudflareCustomCertificateSyncOptions,
  F5BigIpSyncOptions,
  GcpCertificateManagerSyncOptions,
  KempLoadMasterSyncOptions,
  LinuxServerSyncOptions,
  NetScalerSyncOptions,
  PaloAltoNetworksSyncOptions,
  WindowsServerSyncOptions
} from "./destination-options";
import { NameSchemaHelp } from "./name-schema-help";
import { SyncSwitchField } from "./sync-switch-field";

const renderDestinationOptions = (destination: PkiSync, isUpdate?: boolean) => {
  switch (destination) {
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
    case PkiSync.CloudflareCustomCertificate:
      return <CloudflareCustomCertificateSyncOptions />;
    case PkiSync.GcpCertificateManager:
      return <GcpCertificateManagerSyncOptions />;
    case PkiSync.NetScaler:
      return <NetScalerSyncOptions />;
    case PkiSync.PaloAltoNetworks:
    case PkiSync.PaloAltoNetworksSslTlsProfile:
      return <PaloAltoNetworksSyncOptions />;
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

export function PkiSyncOptionsFields({
  destination,
  isUpdate
}: {
  destination?: PkiSync;
  isUpdate?: boolean;
}) {
  const watchedDestination = useWatchedValue<PkiSync>("destination");
  const currentDestination = destination || watchedDestination;
  const { syncOption } = usePkiSyncOption(currentDestination);
  const isElb = currentDestination === PkiSync.AwsElasticLoadBalancer;
  const isServer =
    currentDestination === PkiSync.LinuxServer || currentDestination === PkiSync.WindowsServer;

  return (
    <>
      {syncOption?.canRemoveCertificates && (
        <SyncSwitchField
          name="syncOptions.canRemoveCertificates"
          label="Remove certificates from destination"
          description={`When enabled, Infisical deletes a certificate from the destination once this sync stops holding it, whether it stopped being active, was deleted, was removed from the sync, or stopped matching the sync's filters. Disable this if you manage some certificates manually outside of Infisical.${
            isElb
              ? " For AWS Elastic Load Balancer, this removes the certificate from both the load balancer listeners and AWS Certificate Manager, affecting only certificates managed by this sync."
              : ""
          }`}
        />
      )}

      {!INCLUDE_ROOT_CA_UNSUPPORTED_DESTINATIONS.includes(currentDestination) && (
        <SyncSwitchField
          name="syncOptions.includeRootCa"
          label="Include root CA in certificate chain"
          description="When enabled, the full certificate chain including the root CA is synced. When disabled, the root CA is excluded to reduce the chain size; most applications validate correctly with intermediate certificates only."
        />
      )}

      {renderDestinationOptions(currentDestination, isUpdate)}

      {!CERTIFICATE_NAME_SCHEMA_UNSUPPORTED_DESTINATIONS.includes(currentDestination) && (
        <TextField
          name="syncOptions.certificateNameSchema"
          label="Certificate name schema"
          optional={isElb}
          placeholder={syncOption?.defaultCertificateNameSchema || "INFISICAL_{{certificateId}}"}
          description="Keeps Infisical to the certificates this schema names, leaving everything else in the destination untouched."
          help={
            <NameSchemaHelp>
              <span>
                When a certificate is synced, the certificate name schema is applied before it
                reaches the destination.
              </span>
              <span>Available placeholders:</span>
              <ul>
                <li>
                  <Code>{"{{certificateId}}"}</Code>: the unique ID of the certificate
                </li>
                <li>
                  <Code>{"{{shortCertificateId}}"}</Code>: a shorter (22-character) form of the
                  certificate ID. Use it instead of <Code>{"{{certificateId}}"}</Code> when the
                  destination&apos;s name limit is tight (e.g. NetScaler&apos;s 63 characters).
                </li>
                <li>
                  <Code>{"{{commonName}}"}</Code>: the certificate&apos;s common name (FQDN)
                </li>
                <li>
                  <Code>{"{{profileId}}"}</Code>: the certificate profile ID (falls back to the
                  certificate ID when none is set)
                </li>
                <li>
                  <Code>{"{{applicationId}}"}</Code>: the ID of the application the sync belongs to
                </li>
                <li>
                  <Code>{"{{applicationName}}"}</Code>: the name of the application the sync belongs
                  to
                </li>
              </ul>
              {isServer ? (
                <span>
                  A placeholder is optional here. Include one (for example{" "}
                  <Code>{"{{commonName}}"}</Code>) so each certificate resolves to a distinct file
                  name. A schema with no placeholder resolves to a fixed name and can be linked to
                  only one certificate. When placeholders resolve, any characters the destination
                  doesn&apos;t support are replaced with hyphens.
                </span>
              ) : (
                <span>
                  The schema must include <Code>{"{{certificateId}}"}</Code> or{" "}
                  <Code>{"{{shortCertificateId}}"}</Code> so each certificate gets a unique name.
                  The template itself can only contain letters, numbers, and the separators allowed
                  by the destination. When placeholders resolve, any characters the destination
                  doesn&apos;t support are replaced with hyphens.
                </span>
              )}
            </NameSchemaHelp>
          }
        />
      )}
    </>
  );
}
