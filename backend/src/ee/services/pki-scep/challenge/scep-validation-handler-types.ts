import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TScepDynamicChallengeDALFactory } from "../pki-scep-dynamic-challenge-dal";

export type ScepValidationContext = {
  challengePassword: string;
  transactionId: string;
  csrDer: Buffer;
  scepConfigId: string;
  validationConnectionId?: string | null;
};

export type ScepValidationResult = { allowed: true } | { allowed: false; error?: string };

export type ScepIssuedContext = {
  transactionId: string;
  csrDer: Buffer;
  certificateDer: Buffer;
  validationConnectionId?: string | null;
};

export type ScepFailureContext = {
  transactionId: string;
  csrDer: Buffer;
  error?: string;
  validationConnectionId?: string | null;
};

export interface IScepValidationHandler {
  validateRequest(ctx: ScepValidationContext): Promise<ScepValidationResult>;
  reportIssued?(ctx: ScepIssuedContext): Promise<void>;
  reportFailure?(ctx: ScepFailureContext): Promise<void>;
}

export type TScepValidationHandlerDeps = {
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "findById">;
  scepDynamicChallengeDAL: Pick<TScepDynamicChallengeDALFactory, "consumeByHash">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};
