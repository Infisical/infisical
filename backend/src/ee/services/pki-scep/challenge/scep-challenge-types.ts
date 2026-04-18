export enum ScepChallengeType {
  STATIC = "static",
  DYNAMIC = "dynamic"
}

export interface IScepChallengeValidator {
  validate(challengePassword: string, scepConfigId: string): Promise<boolean>;
}
