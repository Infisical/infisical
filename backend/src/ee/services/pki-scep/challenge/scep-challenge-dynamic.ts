import { crypto } from "@app/lib/crypto/cryptography";

import { TScepDynamicChallengeDALFactory } from "../pki-scep-dynamic-challenge-dal";
import { IScepChallengeValidator } from "./scep-challenge-types";

type TDynamicChallengeValidatorDep = {
  scepDynamicChallengeDAL: Pick<TScepDynamicChallengeDALFactory, "consumeByHash">;
};

export const dynamicChallengeValidator = ({
  scepDynamicChallengeDAL
}: TDynamicChallengeValidatorDep): IScepChallengeValidator => ({
  validate: async (challengePassword: string, scepConfigId: string): Promise<boolean> => {
    if (!challengePassword) return false;

    const hashedChallenge = crypto.nativeCrypto.createHash("sha256").update(challengePassword).digest("hex");
    const claimed = await scepDynamicChallengeDAL.consumeByHash(hashedChallenge, scepConfigId);

    return !!claimed;
  }
});
