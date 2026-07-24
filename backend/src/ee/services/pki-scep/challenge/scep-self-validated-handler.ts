import { dynamicChallengeValidator } from "./scep-challenge-dynamic";
import { staticChallengeValidator } from "./scep-challenge-static";
import { IScepChallengeValidator, ScepChallengeType } from "./scep-challenge-types";
import { IScepValidationHandler, TScepValidationHandlerDeps } from "./scep-validation-handler-types";

export const selfValidatedHandler = (
  challengeType: ScepChallengeType.STATIC | ScepChallengeType.DYNAMIC,
  deps: TScepValidationHandlerDeps
): IScepValidationHandler => {
  const validator: IScepChallengeValidator =
    challengeType === ScepChallengeType.DYNAMIC
      ? dynamicChallengeValidator({ scepDynamicChallengeDAL: deps.scepDynamicChallengeDAL })
      : staticChallengeValidator({ scepEnrollmentConfigDAL: deps.scepEnrollmentConfigDAL });

  return {
    validateRequest: async (ctx) => {
      const isValid = await validator.validate(ctx.challengePassword, ctx.scepConfigId);
      return isValid ? { allowed: true } : { allowed: false };
    }
  };
};
