import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TGetSecretsActivationStatusDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};


export type TActivationRecord = {
  firstSecretCreatedAt?: Date | null;
  returnedAfterThreeDaysAt?: Date | null;
  returnedAfterSevenDaysAt?: Date | null;
};

export type TSecretsActivationStatus = {
  shouldShowActivation: boolean;
  stage: "FIRST_SECRET" | "THREE_DAYS" | "SEVEN_DAYS" | null;
  activation: {
    firstSecretCreatedAt: Date | null;
    returnedAfterThreeDaysAt: Date | null;
    returnedAfterSevenDaysAt: Date | null;
  } | null;
};