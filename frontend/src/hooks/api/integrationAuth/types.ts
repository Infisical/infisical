export type IntegrationAuth = {
    _id: string;
    workspace: string;
    integration: string;
    teamId?: string;
    accountId?: string;
}

export type App = {
    name: string;
    appId?: string;
    owner?: string;
}