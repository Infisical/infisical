import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';

import { 
  Button, 
  Card, 
  CardTitle, 
  FormControl, 
  Input, 
  Select, 
  SelectItem 
} from '../components/v2';
import AuthorizeIntegration from './api/integrations/authorizeIntegration';
import updateIntegration from './api/integrations/updateIntegration';
import getAWorkspace from './api/workspace/getAWorkspace';

interface Integration {
  _id: string;
  isActive: boolean;
  app: string | null;
  appId: string | null;
  createdAt: string;
  updatedAt: string;
  environment: string;
  integration: string;
  targetEnvironment: string;
  workspace: string;
  integrationAuth: string;
}

export default function AzureKeyVault() {
  const router = useRouter();

  // query-string variables
  const parsedUrl = queryString.parse(router.asPath.split('?')[1]);
  const {code} = parsedUrl;
  const {state} = parsedUrl;

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [environments, setEnvironments] = useState<
    {
      name: string;
      slug: string;
    }[]
  >([]);
  const [environment, setEnvironment] = useState('');
  const [vaultBaseUrl, setVaultBaseUrl] = useState('');
  const [vaultBaseUrlErrorText, setVaultBaseUrlErrorText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    (async () => {
      try {
        if (state === localStorage.getItem('latestCSRFToken')) {
          localStorage.removeItem('latestCSRFToken');

          const integrationDetails = await AuthorizeIntegration({
            workspaceId: localStorage.getItem('projectData.id') as string,
            code: code as string,
            integration: 'azure-key-vault',
          });
          
          setIntegration(integrationDetails.integration);
          
          const workspaceId = localStorage.getItem('projectData.id');
          if (!workspaceId) return;

          const workspace = await getAWorkspace(workspaceId);
          setEnvironment(workspace.environments[0].slug);
          setEnvironments(workspace.environments);

        }
      } catch (error) {
        console.error('Azure Key Vault integration error: ', error);
      }
    })();
  }, []);

  const handleButtonClick = async () => {
    try {
      if (vaultBaseUrl.length === 0) {
        setVaultBaseUrlErrorText('Vault URI cannot be blank');
        return;
      }
      
      if (
        !vaultBaseUrl.startsWith('https://') 
        || !vaultBaseUrl.endsWith('vault.azure.net')
      ) {
        setVaultBaseUrlErrorText('Vault URI must be like https://<vault_name>.vault.azure.net');
        return;
      }
      
      if (!integration) return;
      
      setIsLoading(true);
      await updateIntegration({
        integrationId: integration._id,
        isActive: true,
        environment,
        app: vaultBaseUrl,
        appId: null,
        targetEnvironment: null,
        owner: null
      });
      setIsLoading(false);
      
      router.push(
        `/integrations/${localStorage.getItem('projectData.id')}`
      );
      
    } catch (err) {
      console.error(err);
    }
  }

  return (integration && environments.length > 0) ? (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>Azure Key Vault Integration</CardTitle>
        <FormControl
          label="Project Environment"
          className='mt-4'
        >
          <Select
            value={environment}
            onValueChange={(val) => setEnvironment(val)}
            className='w-full border border-mineshaft-500'
          >
            {environments.map((e) => (
              <SelectItem value={e.slug} key={`azure-key-vault-environment-${e.slug}`}>
                {e.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          label="Vault URI"
          errorText={vaultBaseUrlErrorText}
          isError={vaultBaseUrlErrorText !== '' ?? false}
        >
          <Input
            placeholder='https://example.vault.azure.net'
            value={vaultBaseUrl}
            onChange={(e) => setVaultBaseUrl(e.target.value)}
          />
        </FormControl>
          <Button 
            onClick={handleButtonClick}
            color="mineshaft" 
            className='mt-4'
            isLoading={isLoading}
          >
            Create Integration
          </Button>
      </Card>
    </div>
  ) : <div />
}

AzureKeyVault.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);