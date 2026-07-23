import slugify from "@sindresorhus/slugify";

import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TUserDALFactory } from "@app/services/user/user-dal";

export const normalizeUsername = async (username: string, userDAL: Pick<TUserDALFactory, "findOne">) => {
  let attempt: string;
  let user;
  const MAX_RETRIES = 20;

  for (let retries = 0; retries < MAX_RETRIES; retries++) {
    attempt = slugify(`${username}-${alphaNumericNanoId(4)}`);
    // eslint-disable-next-line no-await-in-loop
    user = await userDAL.findOne({ username: attempt });
    if (!user) return attempt;
  }

  throw new Error(`Failed to generate unique username after ${MAX_RETRIES} attempts`);
};
