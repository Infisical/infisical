import { request } from "@app/lib/config/request";

import { blockLocalAndPrivateIpAddresses } from "./validate-url";

export const fetchUserWebhook = async (userSuppliedUrl: string): Promise<unknown> => {
  await blockLocalAndPrivateIpAddresses(userSuppliedUrl);

  const response = await request.get<unknown>(userSuppliedUrl);
  return response.data;
};
