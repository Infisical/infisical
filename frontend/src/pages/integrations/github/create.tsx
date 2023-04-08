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

export default function GitHubCreateIntegrationPage() {
    const router = useRouter();

    const { integrationAuthId } = queryString.parse(router.asPath.split('?')[1]);

    const { data: workspace } = useGetWorkspaceById(localStorage.getItem('projectData.id') ?? '');
    const { data: integrationAuth } = useGetIntegrationAuthById(integrationAuthId as string ?? '');
    const { data: integrationAuthApps } = useGetIntegrationAuthApps({
      integrationAuthId: integrationAuthId as string ?? ''
    });
    
    const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState('');
    const [targetAppId, setTargetAppId] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        if (workspace) {
            setSelectedSourceEnvironment(workspace.environments[0].slug);
        }
    }, [workspace]);
    
    useEffect(() => {
        if (integrationAuthApps) {
          if (integrationAuthApps.length > 0) {
            setTargetAppId(integrationAuthApps[0].appId as string);
          } else {
            setTargetAppId('none');
          }
        }
    }, [integrationAuthApps]);
        
    const handleButtonClick = async () => {
        try {
            setIsLoading(true);

            if (!integrationAuth?._id) return;
            
            const targetApp = integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.appId === targetAppId);
            
            if (!targetApp || !targetApp.owner) return;
            
            await createIntegration({
                integrationAuthId: integrationAuth?._id,
                isActive: true,
                app: targetApp.name,
                appId: null,
                sourceEnvironment: selectedSourceEnvironment,
                targetEnvironment: null,
                targetEnvironmentId: null,
                owner: targetApp.owner,
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
    
    return (integrationAuth && workspace && selectedSourceEnvironment && integrationAuthApps && targetAppId) ? (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>GitHub Integration</CardTitle>
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
          label="GitHub Repo"
          className='mt-4'
        >
          <Select
            value={targetAppId}
            onValueChange={(val) => setTargetAppId(val)}
            className='w-full border border-mineshaft-500'
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem value={integrationAuthApp.appId as string} key={`github-repo-${integrationAuthApp.appId}`}>
                  {integrationAuthApp.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-app-none">
                No repositories found
              </SelectItem>
            )}
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

GitHubCreateIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);