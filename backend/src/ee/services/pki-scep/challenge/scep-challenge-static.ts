import { crypto } from "@app/lib/crypto/cryptography";
import { TScepEnrollmentConfigDALFactory } from "@app/services/enrollment-config/scep-enrollment-config-dal";

import { IScepChallengeValidator } from "./scep-challenge-types";

type TStaticChallengeValidatorDep = {
  scepEnrollmentConfigDAL: Pick<TScepEnrollmentConfigDALFactory, "findById">;
};

export const staticChallengeValidator = ({
  scepEnrollmentConfigDAL
}: TStaticChallengeValidatorDep): IScepChallengeValidator => ({
  validate: async (challengePassword: string, scepConfigId: string): Promise<boolean> => {
    if (!challengePassword) return false;

    const scepConfig = await scepEnrollmentConfigDAL.findById(scepConfigId);
    if (!scepConfig?.hashedChallengePassword) return false;

    return crypto.hashing().compareHash(challengePassword, scepConfig.hashedChallengePassword);
  }
});
