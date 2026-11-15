import { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";

import { PamAccountType } from "./enums";

// Mirrors the backend's resolveGatewayAccountType
const GATEWAY_ACCOUNT_TYPE_ALIASES: Partial<Record<string, PamAccountType>> = {
  [PamAccountType.WindowsAd]: PamAccountType.Windows,
  [PamAccountType.CockroachDB]: PamAccountType.Postgres
};

const gatewayAccountType = (accountType: PamAccountType | string) =>
  GATEWAY_ACCOUNT_TYPE_ALIASES[accountType] ?? accountType;

export const gatewaySupportsAccountType = (
  gateway: TGatewayV2 | undefined,
  accountType: PamAccountType | string
): boolean => {
  const supported = gateway?.capabilities?.supported_account_types;
  if (!Array.isArray(supported)) return true;
  return supported.includes(gatewayAccountType(accountType));
};
