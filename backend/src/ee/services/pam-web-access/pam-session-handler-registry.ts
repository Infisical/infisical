import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";

import { TSessionContext, TSessionHandlerResult } from "./pam-web-access-types";

export type TWebAccessHandler = (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
) => Promise<TSessionHandlerResult>;

type TSessionHandlerEntry = {
  gatewayResourceType: PamResource;
  handler: TWebAccessHandler;
};

const registry = new Map<PamAccountType, TSessionHandlerEntry>();

export const registerSessionHandler = (accountType: PamAccountType, entry: TSessionHandlerEntry) => {
  registry.set(accountType, entry);
};

export const getSessionHandler = (accountType: PamAccountType): TSessionHandlerEntry | undefined => {
  return registry.get(accountType);
};

export const isWebAccessSupported = (accountType: PamAccountType): boolean => {
  return registry.has(accountType);
};
