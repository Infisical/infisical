import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

export const AWS_ELASTIC_LOAD_BALANCER_PKI_SYNC_LIST_OPTION = {
  name: "AWS Elastic Load Balancer" as const,
  connection: AppConnection.AWS,
  destination: PkiSync.AwsElasticLoadBalancer,
  canImportCertificates: false,
  canRemoveCertificates: true
} as const;
