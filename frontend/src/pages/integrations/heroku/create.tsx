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

export default function HerokuCreateIntegrationPage() {
    const router = useRouter();

    const { integrationAuthId } = queryString.parse(router.asPath.split('?')[1]);

    const { data: workspace } = useGetWorkspaceById(localStorage.getItem('projectData.id') ?? '');
    const { data: integrationAuth } = useGetIntegrationAuthById(integrationAuthId as string ?? '');
    const { data: integrationAuthApps } = useGetIntegrationAuthApps(integrationAuthId as string ?? '');
    
    const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState('');
    const [targetApp, setTargetApp] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        if (workspace) {
            setSelectedSourceEnvironment(workspace.environments[0].slug);
        }
    }, [workspace]);
    
    useEffect(() => {
        // TODO: handle case where apps can be empty
        if (integrationAuthApps) {
            setTargetApp(integrationAuthApps[0].name);
        }
    }, [integrationAuthApps]);
        
    const handleButtonClick = async () => {
        try {
            setIsLoading(true);

            if (!integrationAuth?._id) return;

            await createIntegration({
              integrationAuthId: integrationAuth?._id,
              isActive: true,
              app: targetApp,
              appId: null,
              sourceEnvironment: selectedSourceEnvironment,
              targetEnvironment: null,
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
    
    return (integrationAuth && workspace && selectedSourceEnvironment && integrationAuthApps && targetApp) ? (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>Heroku Integration</CardTitle>
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
          label="Heroku App"
          className='mt-4'
        >
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            className='w-full border border-mineshaft-500'
          >
            {integrationAuthApps.map((integrationAuthApp) => (
              <SelectItem value={integrationAuthApp.name} key={`heroku-environment-${integrationAuthApp.name}`}>
                {integrationAuthApp.name}
              </SelectItem>
            ))}
          </Select>
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

HerokuCreateIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);