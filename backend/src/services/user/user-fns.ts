import slugify from "@sindresorhus/slugify";

import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TUserDALFactory } from "@app/services/user/user-dal";

export const normalizeUsername = async (username: string, userDAL: Pick<TUserDALFactory, "findOne">) => {
  let attempt: string;
  let user;

  do {
    attempt = slugify(`${username}-${alphaNumericNanoId(4)}`);
    // eslint-disable-next-line no-await-in-loop
    user = await userDAL.findOne({ username: attempt });
  } while (user);

  return attempt;
};
