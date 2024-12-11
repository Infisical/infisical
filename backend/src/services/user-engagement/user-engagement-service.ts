import axios from "axios";

import { getConfig } from "@app/lib/config/env";
import { InternalServerError } from "@app/lib/errors";

import { TOrgDALFactory } from "../org/org-dal";
import { TUserDALFactory } from "../user/user-dal";

type TUserEngagementServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TUserEngagementServiceFactory = ReturnType<typeof userEngagementServiceFactory>;

export const userEngagementServiceFactory = ({ userDAL, orgDAL }: TUserEngagementServiceFactoryDep) => {
  const createUserWish = async (userId: string, orgId: string, text: string) => {
    const user = await userDAL.findById(userId);
    const org = await orgDAL.findById(orgId);
    const appCfg = getConfig();

    if (!appCfg.PYLON_API_KEY) {
      throw new InternalServerError({
        message: "Pylon is not configured."
      });
    }

    const request = axios.create({
      baseURL: "https://api.usepylon.com",
      headers: {
        Authorization: `Bearer ${appCfg.PYLON_API_KEY}`
      }
    });

    await request.post("/issues", {
      title: `New Wish From: ${user.firstName} ${user.lastName} (${org.name})`,
      body_html: text,
      requester_email: user.email,
      requester_name: `${user.firstName} ${user.lastName} (${org.name})`,
      tags: ["wish"]
    });
  };
  return {
    createUserWish
  };
};
