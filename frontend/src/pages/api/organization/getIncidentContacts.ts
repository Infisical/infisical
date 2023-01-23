import SecurityClient from '@app/components/utilities/SecurityClient';

export interface IIncidentContactOrg {
  _id: string;
  email: string;
  organization: string;
}
/**
 * This routes gets all the incident contacts of a certain organization
 * @param {*} workspaceId
 * @returns
 */
const getIncidentContacts = (organizationId: string): Promise<IIncidentContactOrg[]> =>
  SecurityClient.fetchCall(`/v1/organization/${organizationId}/incidentContactOrg`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).incidentContactsOrg;
    }
    console.log('Failed to get incident contacts');
    return undefined;
  });

export default getIncidentContacts;
