import { TActorInput } from "@app/lib/types";

export type TGetSecretsActivationStatusDTO = TActorInput;

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
