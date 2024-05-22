import slugify from "@sindresorhus/slugify";

import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TUserDALFactory } from "@app/services/user/user-dal";

export const normalizeUsername = async (username: string, userDAL: Pick<TUserDALFactory, "findOne">) => {
  let attempt = slugify(`${username}-${alphaNumericNanoId(4)}`);

  let user = await userDAL.findOne({ username: attempt });
  if (!user) return attempt;

  while (true) {
    attempt = slugify(`${username}-${alphaNumericNanoId(4)}`);
    // eslint-disable-next-line no-await-in-loop
    user = await userDAL.findOne({ username: attempt });

    if (!user) {
      return attempt;
    }
  }
};

export const processFailedMfaAttempt = async (userId: string, userDAL: Pick<TUserDALFactory, "transaction">) => {
  try {
    const updatedUser = await userDAL.transaction(async (tx) => {
      const PROGRESSIVE_DELAY_INTERVAL = 3;
      const [user] = await tx(TableName.Users)
        .where("id", userId)
        .increment("consecutiveFailedMfaAttempts", 1)
        .returning("*");

      if (!user) {
        throw new Error("User not found");
      }

      const progressiveDelaysInMins = [5, 30, 60];

      // lock user when failed attempt exceeds threshold
      if (user.consecutiveFailedMfaAttempts >= PROGRESSIVE_DELAY_INTERVAL * (progressiveDelaysInMins.length + 1)) {
        return (
          await tx(TableName.Users)
            .where("id", userId)
            .update({
              isLocked: true,
              temporaryLockDateEnd: null
            })
            .returning("*")
        )[0];
      }

      // delay user only when failed MFA attempts is a multiple of configured delay interval
      if (user.consecutiveFailedMfaAttempts % PROGRESSIVE_DELAY_INTERVAL === 0) {
        const delayIndex = user.consecutiveFailedMfaAttempts / PROGRESSIVE_DELAY_INTERVAL - 1;

        return (
          await tx(TableName.Users)
            .where("id", userId)
            .update({
              temporaryLockDateEnd: new Date(new Date().getTime() + progressiveDelaysInMins[delayIndex] * 60 * 1000)
            })
            .returning("*")
        )[0];
      }

      return user;
    });

    return updatedUser;
  } catch (error) {
    throw new DatabaseError({ error, name: "Process failed MFA Attempt" });
  }
};
