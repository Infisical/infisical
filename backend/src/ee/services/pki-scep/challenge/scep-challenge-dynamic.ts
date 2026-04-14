import { crypto } from "@app/lib/crypto/cryptography";

import { TScepDynamicChallengeDALFactory } from "../pki-scep-dynamic-challenge-dal";
import { IScepChallengeValidator } from "./scep-challenge-types";

type TDynamicChallengeValidatorDep = {
  scepDynamicChallengeDAL: Pick<TScepDynamicChallengeDALFactory, "findUnusedByConfigId" | "markUsed">;
};

export const dynamicChallengeValidator = ({
  scepDynamicChallengeDAL
}: TDynamicChallengeValidatorDep): IScepChallengeValidator => ({
  validate: async (challengePassword: string, scepConfigId: string): Promise<boolean> => {
    if (!challengePassword) return false;

    const pendingChallenges = await scepDynamicChallengeDAL.findUnusedByConfigId(scepConfigId);

    for (const challenge of pendingChallenges) {
      // eslint-disable-next-line no-await-in-loop
      const matches = await crypto.hashing().compareHash(challengePassword, challenge.hashedChallenge);
      if (matches) {
        // eslint-disable-next-line no-await-in-loop
        const claimed = await scepDynamicChallengeDAL.markUsed(challenge.id);
        if (claimed) return true;
      }
    }

    return false;
  }
});
