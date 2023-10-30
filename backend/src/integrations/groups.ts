import {
    IIntegrationAuth,
} from "../models";
import {
    INTEGRATION_CHECKLY,
    INTEGRATION_CHECKLY_API_URL,
} from "../variables";
import { standardRequest } from "../config/request";

interface Group {
    name: string;
    groupId: string;
}

/**
 * Return list of groups for checkly integration authorization [integrationAuth]
 * @param {Object} obj
 * @param {String} obj.integrationAuth - integration authorization to get groups
 * @param {String} obj.accessToken - access token for integration authorization
 * @returns {Object[]} groups - groups for integration authorization
 * @returns {String} groups.name - name of group
 * @returns {String} groups.groupId - id of group
*/
const getGroups = async ({
    integrationAuth,
    accessToken,
}: {
    integrationAuth: IIntegrationAuth;
    accessToken: string;
}) => {
    
    let groups: Group[] = [];

    switch (integrationAuth.integration) {
        case INTEGRATION_CHECKLY:
            groups = await getGroupsCheckly({
                accessToken,
            });
            break;
    }
    
    return groups;
}

/**
 * Return list of groups for Checkly integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Checkly API
 * @returns {Object[]} groups - list of groups in Checkly
 * @returns {String} groups.name - name of group
 * @returns {String} groups.groupId - id of group
*/
const getGroupsCheckly = async ({
    accessToken,
}: {
    accessToken: string;
}) => {
    
    let groups: Group[] = [];

      // case: fetch account id
    const { data } = await standardRequest.get(`${INTEGRATION_CHECKLY_API_URL}/v1/accounts`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
    });

    const accountId = data.map((a: any) => {
        return {
          id: a.id,
        };
    });

      // case: fetch list of groups in Checkly
    const res = accountId.length > 0 && (
        await standardRequest.get(`${INTEGRATION_CHECKLY_API_URL}/v1/check-groups`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
                "X-Checkly-Account": accountId[0].id,
            }
        })
    ).data;

    groups = res.map((g: any) => ({
      name: g.name,
      groupId: g.id,
    }));
    
    return groups;
}

export {
    getGroups,
}