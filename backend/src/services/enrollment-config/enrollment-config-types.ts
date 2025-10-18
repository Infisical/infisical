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

export type TEstEnrollmentConfig = TPkiEstEnrollmentConfigs;
export type TEstEnrollmentConfigInsert = TPkiEstEnrollmentConfigsInsert;
export type TEstEnrollmentConfigUpdate = TPkiEstEnrollmentConfigsUpdate;

export type TApiEnrollmentConfig = TPkiApiEnrollmentConfigs;
export type TApiEnrollmentConfigInsert = TPkiApiEnrollmentConfigsInsert;
export type TApiEnrollmentConfigUpdate = TPkiApiEnrollmentConfigsUpdate;

export interface TEstConfigData {
  disableBootstrapCaValidation: boolean;
  passphraseInput: string;
  encryptedCaChain?: string;
}

export interface TApiConfigData {
  autoRenew: boolean;
  autoRenewDays?: number;
}
