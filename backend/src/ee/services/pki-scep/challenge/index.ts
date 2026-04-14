import { BadRequestError } from "@app/lib/errors";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";

import { TScepDynamicChallengeDALFactory } from "../pki-scep-dynamic-challenge-dal";
import { dynamicChallengeValidator } from "./scep-challenge-dynamic";
import { staticChallengeValidator } from "./scep-challenge-static";
import { IScepChallengeValidator, ScepChallengeType } from "./scep-challenge-types";

export type { IScepChallengeValidator } from "./scep-challenge-types";
export { ScepChallengeType } from "./scep-challenge-types";

type TScepChallengeValidatorFactoryDep = {
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "findById">;
  scepDynamicChallengeDAL: Pick<TScepDynamicChallengeDALFactory, "findUnusedByConfigId" | "markUsed">;
};

export const getScepChallengeValidator = (
  challengeType: ScepChallengeType,
  deps: TScepChallengeValidatorFactoryDep
): IScepChallengeValidator => {
  switch (challengeType) {
    case ScepChallengeType.DYNAMIC:
      return dynamicChallengeValidator({ scepDynamicChallengeDAL: deps.scepDynamicChallengeDAL });
    case ScepChallengeType.STATIC:
      return staticChallengeValidator({ scepEnrollmentConfigDAL: deps.scepEnrollmentConfigDAL });
    default:
      throw new BadRequestError({ message: `Unsupported SCEP challenge type: ${String(challengeType)}` });
  }
};
