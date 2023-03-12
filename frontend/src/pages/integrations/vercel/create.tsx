import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import { getTranslatedServerSideProps } from '../../../components/utilities/withTranslateProps';
import {
    Button, 
    Card, 
    CardTitle, 
    FormControl, 
    Select, 
    SelectItem 
} from '../../../components/v2';
import { useGetIntegrationAuthApps,useGetIntegrationAuthById } from '../../../hooks/api/integrationAuth';
import { useGetWorkspaceById } from '../../../hooks/api/workspace';
import createIntegration from "../../api/integrations/createIntegration";

const vercelEnvironments = [
    { name: 'Development', slug: 'development' },
    { name: 'Preview', slug: 'preview' },
    { name: 'Production', slug: 'production' }
]

export default function VercelCreateIntegrationPage() {
    const router = useRouter();

    const { integrationAuthId } = queryString.parse(router.asPath.split('?')[1]);

    const { data: workspace } = useGetWorkspaceById(localStorage.getItem('projectData.id') ?? '');
    const { data: integrationAuth } = useGetIntegrationAuthById(integrationAuthId as string ?? '');
    const { data: integrationAuthApps } = useGetIntegrationAuthApps({
      integrationAuthId: integrationAuthId as string ?? ''
    });
    
    const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState('');
    const [targetApp, setTargetApp] = useState('');
    const [targetEnvironment, setTargetEnvironment] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        if (workspace) {
            setSelectedSourceEnvironment(workspace.environments[0].slug);
        }
    }, [workspace]);
    
    useEffect(() => {
        if (integrationAuthApps) {
          if (integrationAuthApps.length > 0) {
            setTargetApp(integrationAuthApps[0].name);
            setTargetEnvironment(vercelEnvironments[0].slug);
          } else {
            setTargetApp('none');
            setTargetEnvironment(vercelEnvironments[0].slug);
          }
        }
    }, [integrationAuthApps]);
        
    const handleButtonClick = async () => {
        try {
            if (!integrationAuth?._id) return;

            setIsLoading(true);
            await createIntegration({
              integrationAuthId: integrationAuth?._id,
              isActive: true,
              app: targetApp,
              appId: null,
              sourceEnvironment: selectedSourceEnvironment,
              targetEnvironment,
              owner: null,
              path: null,
              region: null
            }); 
            
            setIsLoading(false);
            router.push(
                `/integrations/${localStorage.getItem('projectData.id')}`
            );
        } catch (err) {
            console.error(err);
        }
    }
    
    return (integrationAuth && workspace && selectedSourceEnvironment && integrationAuthApps && targetApp && targetEnvironment) ? (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>Vercel Integration</CardTitle>
        <FormControl
          label="Project Environment"
          className='mt-4'
        >
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className='w-full border border-mineshaft-500'
          >
            {workspace?.environments.map((sourceEnvironment) => (
              <SelectItem value={sourceEnvironment.slug} key={`azure-key-vault-environment-${sourceEnvironment.slug}`}>
                {sourceEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          label="Vercel App"
        >
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            className='w-full border border-mineshaft-500'
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem value={integrationAuthApp.name} key={`target-app-${integrationAuthApp.name}`}>
                  {integrationAuthApp.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-app-none">
                No projects found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl
          label="Vercel App Environment"
        >
          <Select
            value={targetEnvironment}
            onValueChange={(val) => setTargetEnvironment(val)}
            className='w-full border border-mineshaft-500'
          >
            {vercelEnvironments.map((vercelEnvironment) => (
              <SelectItem value={vercelEnvironment.slug} key={`target-environment-${vercelEnvironment.slug}`}>
                {vercelEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <Button 
          onClick={handleButtonClick}
          color="mineshaft" 
          className='mt-4'
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
        >
            Create Integration
        </Button>
      </Card>
    </div>
  ) : <div />
}

VercelCreateIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);