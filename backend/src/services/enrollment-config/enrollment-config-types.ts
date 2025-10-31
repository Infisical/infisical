import {
  TPkiApiEnrollmentConfigs,
  TPkiApiEnrollmentConfigsInsert,
  TPkiApiEnrollmentConfigsUpdate
} from "@app/db/schemas/pki-api-enrollment-configs";
import {
  TPkiEstEnrollmentConfigs,
  TPkiEstEnrollmentConfigsInsert,
  TPkiEstEnrollmentConfigsUpdate
} from "@app/db/schemas/pki-est-enrollment-configs";
import {
  TPkiAcmeEnrollmentConfigs,
  TPkiAcmeEnrollmentConfigsInsert,
  TPkiAcmeEnrollmentConfigsUpdate
} from "@app/db/schemas/pki-acme-enrollment-configs";

export type TEstEnrollmentConfig = TPkiEstEnrollmentConfigs;
export type TEstEnrollmentConfigInsert = TPkiEstEnrollmentConfigsInsert;
export type TEstEnrollmentConfigUpdate = TPkiEstEnrollmentConfigsUpdate;

export type TApiEnrollmentConfig = TPkiApiEnrollmentConfigs;
export type TApiEnrollmentConfigInsert = TPkiApiEnrollmentConfigsInsert;
export type TApiEnrollmentConfigUpdate = TPkiApiEnrollmentConfigsUpdate;

export type TAcmeEnrollmentConfig = TPkiAcmeEnrollmentConfigs;
export type TAcmeEnrollmentConfigInsert = TPkiAcmeEnrollmentConfigsInsert;
export type TAcmeEnrollmentConfigUpdate = TPkiAcmeEnrollmentConfigsUpdate;

export interface TEstConfigData {
  disableBootstrapCaValidation: boolean;
  passphrase: string;
  caChain?: string;
}

export interface TApiConfigData {
  autoRenew: boolean;
  renewBeforeDays?: number;
}

export interface TAcmeConfigData {
  // TODO: we don't provide any config for ACME right now, but maybe in the future
}
