import SecurityClient from '~/utilities/SecurityClient';

interface Props {
  integrationId: string;
  key: string;
  secrets: string;
}

const changeHerokuConfigVars = ({ integrationId, key, secrets }: Props) => {
  return SecurityClient.fetchCall(
    '/api/v1/integration/' + integrationId + '/sync',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key,
        secrets
      })
    }
  ).then(async (res) => {
    if (res && res.status == 200) {
      return res;
    } else {
      console.log('Failed to sync secrets to Heroku');
    }
  });
};

export default changeHerokuConfigVars;
