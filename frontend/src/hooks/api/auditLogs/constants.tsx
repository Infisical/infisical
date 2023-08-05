import { EventType, UserAgentType } from "./enums";

export const eventToNameMap: { [K in EventType]: string } = {
    [EventType.GET_SECRETS]: "Get Secrets",
    [EventType.GET_SECRET]: "Get Secret",
    [EventType.CREATE_SECRET]: "Create Secret",
    [EventType.UPDATE_SECRET]: "Update Secret",
    [EventType.DELETE_SECRET]: "Delete Secret",
};

export const userAgentTTypeoNameMap: { [K in UserAgentType]: string } = {
    [UserAgentType.WEB]: "Web",
    [UserAgentType.CLI]: "CLI",
    [UserAgentType.K8_OPERATOR]: "K8s operator",
    [UserAgentType.OTHER]: "Other",
};