import slugify from "@sindresorhus/slugify";

import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TUserDALFactory } from "@app/services/user/user-dal";

export const normalizeUsername = async (username: string, userDAL: Pick<TUserDALFactory, "findOne">) => {
  let attempt = slugify(username, {
    preserveCharacters: ["@", "."]
  });

  let user = await userDAL.findOne({ username: attempt });
  if (!user) return attempt;

  while (true) {
    attempt = slugify(`${username}-${alphaNumericNanoId(4)}`, {
      preserveCharacters: ["@", "."]
    });
    // eslint-disable-next-line no-await-in-loop
    user = await userDAL.findOne({ username: attempt });

    if (!user) {
      return attempt;
    }
  }
};
