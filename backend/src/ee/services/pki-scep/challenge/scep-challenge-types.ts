export enum ScepChallengeType {
  STATIC = "static",
  DYNAMIC = "dynamic",
  MICROSOFT_INTUNE = "microsoft-intune"
}

export interface IScepChallengeValidator {
  validate(challengePassword: string, scepConfigId: string): Promise<boolean>;
}
