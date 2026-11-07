import { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";

import { PamAccountType } from "./enums";

const gatewayAccountType = (accountType: PamAccountType | string) =>
  accountType === PamAccountType.WindowsAd ? PamAccountType.Windows : accountType;

export const gatewaySupportsAccountType = (
  gateway: TGatewayV2 | undefined,
  accountType: PamAccountType | string
): boolean => {
  if (accountType === PamAccountType.WebApp && gateway?.capabilities?.webApp !== true) return false;
  const supported = gateway?.capabilities?.supported_account_types;
  if (!Array.isArray(supported)) return true;
  return supported.includes(gatewayAccountType(accountType));
};
