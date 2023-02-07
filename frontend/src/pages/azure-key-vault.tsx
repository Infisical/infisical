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
import { useGetWorkspaceById } from '../hooks/api/workspace';
import AuthorizeIntegration from './api/integrations/authorizeIntegration';
import createIntegration from './api/integrations/createIntegration';

interface IntegrationAuth {
  _id: string;
  integration: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
}

export default function AzureKeyVault() {
  const router = useRouter();
  const workspaceResult = useGetWorkspaceById(localStorage.getItem('projectData.id') ?? '');

  const { code, state } = queryString.parse(router.asPath.split('?')[1]);

  const [integrationAuth, setIntegrationAuth] = useState<IntegrationAuth | null>(null);
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState('');

  const [vaultBaseUrl, setVaultBaseUrl] = useState('');
  const [vaultBaseUrlErrorText, setVaultBaseUrlErrorText] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    (async () => {
      try {
        if (state !== localStorage.getItem('latestCSRFToken')) return;
        localStorage.removeItem('latestCSRFToken');

        setIntegrationAuth(await AuthorizeIntegration({
          workspaceId: localStorage.getItem('projectData.id') as string,
          code: code as string,
          integration: 'azure-key-vault',
        }));
      } catch (error) {
        console.error('Azure Key Vault integration error: ', error);
      }
    })();
  }, []);
  
  useEffect(() => {
    if (workspaceResult && workspaceResult.data) {
      setSelectedSourceEnvironment(workspaceResult.data.environments[0].slug);
    }
  }, [workspaceResult]);

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
      
      if (!integrationAuth?._id) return;
      
      setIsLoading(true);
      await createIntegration({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: vaultBaseUrl
      });
      setIsLoading(false);
      
      router.push(
        `/integrations/${localStorage.getItem('projectData.id')}`
      );
      
    } catch (err) {
      console.error(err);
    }
  }

  if (!workspaceResult) return <div />
  
  const { data: w } = workspaceResult;

  return (integrationAuth && w && selectedSourceEnvironment) ? (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>Azure Key Vault Integration</CardTitle>
        <FormControl
          label="Project Environment"
          className='mt-4'
        >
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className='w-full border border-mineshaft-500'
          >
            {w?.environments.map((sourceEnvironment) => (
              <SelectItem value={sourceEnvironment.slug} key={`azure-key-vault-environment-${sourceEnvironment.slug}`}>
                {sourceEnvironment.name}
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