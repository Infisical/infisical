import {
  TApiEnrollmentConfigs,
  TApiEnrollmentConfigsInsert,
  TApiEnrollmentConfigsUpdate
} from "@app/db/schemas/api-enrollment-configs";
import {
  TEstEnrollmentConfigs,
  TEstEnrollmentConfigsInsert,
  TEstEnrollmentConfigsUpdate
} from "@app/db/schemas/est-enrollment-configs";

export type TEstEnrollmentConfig = TEstEnrollmentConfigs;
export type TEstEnrollmentConfigInsert = TEstEnrollmentConfigsInsert;
export type TEstEnrollmentConfigUpdate = TEstEnrollmentConfigsUpdate;

export type TApiEnrollmentConfig = TApiEnrollmentConfigs;
export type TApiEnrollmentConfigInsert = TApiEnrollmentConfigsInsert;
export type TApiEnrollmentConfigUpdate = TApiEnrollmentConfigsUpdate;

export interface TEstConfigData {
  disableBootstrapCaValidation: boolean;
  passphrase: string;
  encryptedCaChain: string;
}

export interface TApiConfigData {
  autoRenew: boolean;
  autoRenewDays?: number;
}
