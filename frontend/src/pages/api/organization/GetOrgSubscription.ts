import SecurityClient from '@app/components/utilities/SecurityClient';

/**
 * This route lets us get the current subscription of an org.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const getOrganizationSubscriptions = (req: { orgId: string }) =>
  SecurityClient.fetchCall(`/v1/organization/${req.orgId}/subscriptions`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).subscriptions;
    }
    console.log('Failed to get org subscriptions');
    return undefined;
  });

export default getOrganizationSubscriptions;
