import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route deletes an incident Contact from a certain organization
 * @param {*} param0
 * @returns
 */
const deleteIncidentContact = (organizationId: string, email: string) => {
  return SecurityClient.fetchCall(
    '/api/v1/organization/' + organizationId + '/incidentContactOrg',
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email
      })
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to delete an incident contact');
    }
  });
};

export default deleteIncidentContact;
