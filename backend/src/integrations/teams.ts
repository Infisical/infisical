import {
    IIntegrationAuth,
} from "../models";
import {
    INTEGRATION_GITLAB,
    INTEGRATION_GITLAB_API_URL,
} from "../variables";
import { standardRequest } from "../config/request";

interface Team {
    name: string;
    teamId: string;
}

/**
 * Return list of teams for integration authorization [integrationAuth]
 * @param {Object} obj
 * @param {String} obj.integrationAuth - integration authorization to get teams for
 * @param {String} obj.accessToken - access token for integration authorization
 * @returns {Object[]} teams - teams of integration authorization
 * @returns {String} teams.name - name of team
 * @returns {String} teams.teamId - id of team
*/
const getTeams = async ({
    integrationAuth,
    accessToken,
}: {
    integrationAuth: IIntegrationAuth;
    accessToken: string;
}) => {
    
    let teams: Team[] = [];

    switch (integrationAuth.integration) {
        case INTEGRATION_GITLAB:
            teams = await getTeamsGitLab({
                integrationAuth,
                accessToken,
            });
            break;
    }
    
    return teams;
}

/**
 * Return list of teams for GitLab integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for GitLab API
 * @returns {Object[]} teams - teams that user is part of in GitLab
 * @returns {String} teams.name - name of team
 * @returns {String} teams.teamId - id of team
*/
const getTeamsGitLab = async ({
    integrationAuth,
    accessToken,
}: {
    integrationAuth: IIntegrationAuth;
    accessToken: string;
}) => {
    const gitLabApiUrl = integrationAuth.url ? `${integrationAuth.url}/api` : INTEGRATION_GITLAB_API_URL;
    
    let teams: Team[] = [];
    const res = (await standardRequest.get(
        `${gitLabApiUrl}/v4/groups`,
        {
            headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json",
            },
        }
    )).data; 

    teams = res.map((t: any) => ({
      name: t.name,
      teamId: t.id,
    }));
    
    return teams;
}

export {
    getTeams,
}
