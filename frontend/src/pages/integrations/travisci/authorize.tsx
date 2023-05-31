import { useState } from 'react';
import { useRouter } from 'next/router';

import { Button, Card, CardTitle, FormControl, Input } from '../../../components/v2';
import saveIntegrationAccessToken from '../../api/integrations/saveIntegrationAccessToken';

export default function TravisCICreateIntegrationPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [apiKeyErrorText, setApiKeyErrorText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setApiKeyErrorText('');
      if (apiKey.length === 0) {
        setApiKeyErrorText('API Key cannot be blank');
        return;
      }

      setIsLoading(true);

      const integrationAuth = await saveIntegrationAccessToken({
        workspaceId: localStorage.getItem('projectData.id'),
        integration: 'travisci',
        accessToken: apiKey,
        accessId: null
      });

      setIsLoading(false);

      router.push(`/integrations/travisci/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Travis CI Integration</CardTitle>
        <FormControl
          label="Travis CI API Token"
          errorText={apiKeyErrorText}
          isError={apiKeyErrorText !== '' ?? false}
        >
          <Input placeholder="" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Travis CI
        </Button>
      </Card>
    </div>
  );
}

TravisCICreateIntegrationPage.requireAuth = true;
