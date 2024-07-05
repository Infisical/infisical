import { PlainClient } from "@team-plain/typescript-sdk";

import { getConfig } from "@app/lib/config/env";
import { InternalServerError } from "@app/lib/errors";

import { TUserDALFactory } from "../user/user-dal";

type TUserEngagementServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TUserEngagementServiceFactory = ReturnType<typeof userEngagementServiceFactory>;

export const userEngagementServiceFactory = ({ userDAL }: TUserEngagementServiceFactoryDep) => {
  const createUserWish = async (userId: string, text: string) => {
    const user = await userDAL.findById(userId);
    const appCfg = getConfig();

    if (!appCfg.PLAIN_API_KEY) {
      throw new InternalServerError({
        message: "Plain is not configured."
      });
    }

    const client = new PlainClient({
      apiKey: appCfg.PLAIN_API_KEY
    });

    const customerUpsertRes = await client.upsertCustomer({
      identifier: {
        emailAddress: user.email
      },
      onCreate: {
        fullName: `${user.firstName} ${user.lastName}`,
        shortName: user.firstName,
        email: {
          email: user.email as string,
          isVerified: user.isEmailVerified as boolean
        },

        externalId: user.id
      },

      onUpdate: {
        fullName: {
          value: `${user.firstName} ${user.lastName}`
        },
        shortName: {
          value: user.firstName
        },
        email: {
          email: user.email as string,
          isVerified: user.isEmailVerified as boolean
        },
        externalId: {
          value: user.id
        }
      }
    });

    if (customerUpsertRes.error) {
      throw new InternalServerError({ message: customerUpsertRes.error.message });
    }

    const createThreadRes = await client.createThread({
      title: "Wish",
      customerIdentifier: {
        externalId: customerUpsertRes.data.customer.externalId
      },
      components: [
        {
          componentText: {
            text
          }
        }
      ],
      labelTypeIds: appCfg.PLAIN_WISH_LABEL_IDS?.split(",")
    });

    if (createThreadRes.error) {
      throw new InternalServerError({
        message: createThreadRes.error.message
      });
    }
  };
  return {
    createUserWish
  };
};
