import { useFormContext } from "react-hook-form";

import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { AwsCertificateManagerPkiSyncFields } from "./AwsCertificateManagerPkiSyncFields";
import { AwsElasticLoadBalancerPkiSyncFields } from "./AwsElasticLoadBalancerPkiSyncFields";
import { AwsSecretsManagerPkiSyncFields } from "./AwsSecretsManagerPkiSyncFields";
import { AzureKeyVaultPkiSyncFields } from "./AzureKeyVaultPkiSyncFields";
import { ChefPkiSyncFields } from "./ChefPkiSyncFields";
import { CloudflareCustomCertificatePkiSyncFields } from "./CloudflareCustomCertificatePkiSyncFields";

export const PkiSyncDestinationFields = () => {
  const { watch } = useFormContext<TPkiSyncForm>();

  const destination = watch("destination");

  switch (destination) {
    case PkiSync.AzureKeyVault:
      return <AzureKeyVaultPkiSyncFields />;
    case PkiSync.AwsCertificateManager:
      return <AwsCertificateManagerPkiSyncFields />;
    case PkiSync.AwsElasticLoadBalancer:
      return <AwsElasticLoadBalancerPkiSyncFields />;
    case PkiSync.AwsSecretsManager:
      return <AwsSecretsManagerPkiSyncFields />;
    case PkiSync.Chef:
      return <ChefPkiSyncFields />;
    case PkiSync.CloudflareCustomCertificate:
      return <CloudflareCustomCertificatePkiSyncFields />;
    default:
      return (
        <div className="flex items-center justify-center rounded-md border border-red-500 bg-red-100 p-4 text-red-700">
          <p>Unsupported destination: {destination}</p>
        </div>
      );
  }
};
