import { BadRequestError } from "@app/lib/errors";

import { ScepChallengeType } from "./scep-challenge-types";
import { intuneDelegatedHandler } from "./scep-intune-handler";
import { selfValidatedHandler } from "./scep-self-validated-handler";
import { IScepValidationHandler, TScepValidationHandlerDeps } from "./scep-validation-handler-types";

export type { IScepChallengeValidator } from "./scep-challenge-types";
export { ScepChallengeType } from "./scep-challenge-types";
export type {
  IScepValidationHandler,
  ScepFailureContext,
  ScepIssuedContext,
  ScepValidationContext,
  ScepValidationResult
} from "./scep-validation-handler-types";

const SCEP_VALIDATION_HANDLERS: Record<
  ScepChallengeType,
  (deps: TScepValidationHandlerDeps) => IScepValidationHandler
> = {
  [ScepChallengeType.STATIC]: (deps) => selfValidatedHandler(ScepChallengeType.STATIC, deps),
  [ScepChallengeType.DYNAMIC]: (deps) => selfValidatedHandler(ScepChallengeType.DYNAMIC, deps),
  [ScepChallengeType.MICROSOFT_INTUNE]: (deps) => intuneDelegatedHandler(deps)
};

export const getScepValidationHandler = (
  challengeType: ScepChallengeType,
  deps: TScepValidationHandlerDeps
): IScepValidationHandler => {
  const factory = SCEP_VALIDATION_HANDLERS[challengeType];
  if (!factory) {
    throw new BadRequestError({ message: `Unsupported SCEP challenge type: ${String(challengeType)}` });
  }
  return factory(deps);
};
