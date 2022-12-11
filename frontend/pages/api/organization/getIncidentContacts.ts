import SecurityClient from '~/utilities/SecurityClient';

/**
 * This routes gets all the incident contacts of a certain organization
 * @param {*} workspaceId
 * @returns
 */
const getIncidentContacts = (organizationId: string) => {
  return SecurityClient.fetchCall(
    '/api/v1/organization/' + organizationId + '/incidentContactOrg',
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (await res.json()).incidentContactsOrg;
    } else {
      console.log('Failed to get incident contacts');
    }
  });
};

export default getIncidentContacts;
