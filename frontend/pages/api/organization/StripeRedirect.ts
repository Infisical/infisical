import SecurityClient from '~/utilities/SecurityClient';

/**
 * This route redirects the user to the right stripe billing page.
 * @param {*} req
 * @param {*} res
 * @returns
 */
const StripeRedirect = ({ orgId }: { orgId: string }) => {
  return SecurityClient.fetchCall(
    '/api/v1/organization/' + orgId + '/customer-portal-session',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return (window.location.href = (await res.json()).url);
    } else {
      console.log('Failed to redirect to Stripe');
    }
  });
};

export default StripeRedirect;
