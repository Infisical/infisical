import * as Sentry from "@sentry/node";
import {
    IIntegrationAuth
} from '../models';
import {
    INTEGRATION_GITLAB,
    INTEGRATION_GITLAB_API_URL
} from '../variables';
import request from '../config/request';

const getTeams = async ({
    integrationAuth,
    accessToken
}: {
    integrationAuth: IIntegrationAuth;
    accessToken: string;
}) => {
    interface Team {
        name: string;
        teamId: string;
    }
    
    let teams: Team[] = [];
    try {
        switch (integrationAuth.integration) {
            case INTEGRATION_GITLAB:
                teams = await getTeamsGitLab({
                    accessToken
                });
                break;
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to get integration teams');
    }
    
    
    return teams;
}

const getTeamsGitLab = async ({
    accessToken
}: {
    accessToken: string;
}) => {
    let teams = [];
    try {
        const res = (await request.get(
            `${INTEGRATION_GITLAB_API_URL}/v4/groups`,
            {
                headers: {
                Authorization: `Bearer ${accessToken}`,
                "Accept-Encoding": "application/json"
                }
            }
        )).data; 
    
      teams = res.map((t: any) => ({
        name: t.name,
        teamId: t.id
      }));
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error("Failed to get GitLab integration teams");
    }
    
    return teams;
}

export {
    getTeams
}