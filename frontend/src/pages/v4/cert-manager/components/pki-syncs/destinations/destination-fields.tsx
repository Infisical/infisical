import { Alert } from "@infisical/cipher/ui/alert";

import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { useWatchedValue } from "../fields";
import { AwsElasticLoadBalancerFields, AwsRegionFields } from "./aws";
import { GcpCertificateManagerFields } from "./gcp";
import { PaloAltoNetworksFields } from "./palo-alto";
import {
  CloudflareCustomCertificateFields,
  ImpervaFields,
  KempLoadMasterFields,
  NutanixPrismCentralFields
} from "./remote";
import {
  AzureKeyVaultFields,
  ChefFields,
  DestinationPathFields,
  F5BigIpFields,
  NetScalerFields
} from "./simple";

export function PkiSyncDestinationFields({ isUpdate }: { isUpdate?: boolean }) {
  const destination = useWatchedValue<PkiSync>("destination");

  switch (destination) {
    case PkiSync.AzureKeyVault:
      return <AzureKeyVaultFields />;
    case PkiSync.AwsCertificateManager:
      return (
        <AwsRegionFields help="The AWS region where your Certificate Manager certificates are stored." />
      );
    case PkiSync.AwsElasticLoadBalancer:
      return <AwsElasticLoadBalancerFields />;
    case PkiSync.AwsSecretsManager:
      return (
        <AwsRegionFields help="The AWS region where your secrets are stored in AWS Secrets Manager." />
      );
    case PkiSync.Chef:
      return <ChefFields />;
    case PkiSync.CloudflareCustomCertificate:
      return <CloudflareCustomCertificateFields />;
    case PkiSync.GcpCertificateManager:
      return <GcpCertificateManagerFields isUpdate={isUpdate} />;
    case PkiSync.NetScaler:
      return <NetScalerFields />;
    case PkiSync.PaloAltoNetworks:
      return <PaloAltoNetworksFields />;
    case PkiSync.PaloAltoNetworksSslTlsProfile:
      return <PaloAltoNetworksFields withSslTlsServiceProfile />;
    case PkiSync.F5BigIp:
      return <F5BigIpFields />;
    case PkiSync.KempLoadMaster:
      return <KempLoadMasterFields />;
    case PkiSync.Imperva:
      return <ImpervaFields />;
    case PkiSync.LinuxServer:
      return (
        <DestinationPathFields
          help="The absolute path to the directory on the server where certificate files are written. The directory must already exist."
          placeholder="/etc/ssl/certs"
        />
      );
    case PkiSync.WindowsServer:
      return (
        <DestinationPathFields
          help="The absolute Windows path to the directory where certificate files are written, for example C:\certs. It is created if it does not exist."
          placeholder="C:\certs"
        />
      );
    case PkiSync.NutanixPrismCentral:
      return <NutanixPrismCentralFields />;
    default:
      return <Alert tone="bad">Unsupported destination: {destination}</Alert>;
  }
}
