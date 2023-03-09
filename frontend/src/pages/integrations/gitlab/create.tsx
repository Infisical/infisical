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
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById, 
  useGetIntegrationAuthTeams} from '../../../hooks/api/integrationAuth';
import { useGetWorkspaceById } from '../../../hooks/api/workspace';
import createIntegration from "../../api/integrations/createIntegration";

const gitLabEntities = [
  { name: 'Individual', value: 'individual' },
  { name: 'Group', value: 'group' }
]

// TODO: flesh out the data flow...

export default function GitLabCreateIntegrationPage() {
    const router = useRouter();

    const { integrationAuthId } = queryString.parse(router.asPath.split('?')[1]);

    const { data: workspace } = useGetWorkspaceById(localStorage.getItem('projectData.id') ?? '');
    const { data: integrationAuth } = useGetIntegrationAuthById(integrationAuthId as string ?? '');
    
    const [targetEntity, setTargetEntity] = useState(gitLabEntities[0].value);
    const [targetTeam, setTargetTeam] = useState('aa'); // ?
    const [targetTeamId] = useState(undefined);
    const { data: integrationAuthApps } = useGetIntegrationAuthApps({
      integrationAuthId: integrationAuthId as string ?? '',
      ...(targetTeamId ? { teamId: targetTeamId } : {})
    });
    const { data: integrationAuthTeams } = useGetIntegrationAuthTeams(integrationAuthId as string ?? '');
    console.log('integrationAuthTeams: ', integrationAuthTeams);
    
    const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState('');
    const [targetApp, setTargetApp] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        if (workspace) {
            setSelectedSourceEnvironment(workspace.environments[0].slug);
        }
        
    }, [workspace]);
    
    useEffect(() => {
      if (integrationAuthApps) {
        if (integrationAuthApps.length > 0) {
          console.log('AA');
          setTargetApp(integrationAuthApps[0].name);
        } else {
          console.log('BB');
          setTargetApp('none');
        }
      }
    }, [integrationAuthApps]);
    
    useEffect(() => {
      // if (targetEntity === 'group' && integrationAuthTeams) {
      //   if (integrationAuthTeams.length > 0) {
      //     setTargetTeam(integrationAuthTeams[0].name);
      //   } else {
      //     setTargetTeam('none');
      //   }
      // }
    
      // if (targetEntity === 'group') {
      //  if (integrationAuthTeams && integrationAuthTeams.length > 0) {
      //     setTargetTeamId(integrationAuthTeams[0].teamId);
      //   } else {
      //     setTargetTeamId('');
      //   } 
      // } else {
        
      // }
    }, [integrationAuthTeams, integrationAuthApps, targetEntity]);
        
    const handleButtonClick = async () => {
        try {
            setIsLoading(true);
            if (!integrationAuth?._id) return;
            
            await createIntegration({
                integrationAuthId: integrationAuth?._id,
                isActive: true,
                app: targetApp,
                appId: (integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.name === targetApp))?.appId ?? null,
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
    
    console.log('A', (integrationAuth && workspace && selectedSourceEnvironment && integrationAuthApps && integrationAuthTeams && targetApp && targetTeam));
    console.log('B', integrationAuth);
    console.log('C', workspace);
    console.log('D', selectedSourceEnvironment);
    console.log('E', integrationAuthApps);
    console.log('F', integrationAuthTeams);
    console.log('G', targetApp);
    console.log('H', targetTeam);
    return (integrationAuth && workspace && selectedSourceEnvironment && integrationAuthApps && integrationAuthTeams && targetApp && targetTeam) ? (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>GitLab Integration</CardTitle>
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
              <SelectItem value={sourceEnvironment.slug} key={`source-environment-${sourceEnvironment.slug}`}>
                {sourceEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          label="GitLab Integration Type"
          className='mt-4'
        >
          <Select
            value={targetEntity}
            onValueChange={(val) => setTargetEntity(val)}
            className='w-full border border-mineshaft-500'
          >
            {gitLabEntities.map((entity) => {
              return (
                <SelectItem value={entity.value} key={`target-entity-${entity.value}`}>
                  {entity.name}
                </SelectItem>
              );
            })}
          </Select>
        </FormControl>
        {targetEntity === 'group' && (
          <FormControl
            label="GitLab Group"
            className='mt-4'
          >
            <Select
              value={targetTeam}
              onValueChange={(val) => setTargetTeam(val)}
              className='w-full border border-mineshaft-500'
            >
              {integrationAuthTeams.length > 0 ? (
                integrationAuthTeams.map((integrationAuthTeam) => (
                  <SelectItem value={integrationAuthTeam.name} key={`target-team-${integrationAuthTeam.name}`}>
                    {integrationAuthTeam.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" key="target-team-none">
                  No groups found
                </SelectItem>
              )}
            </Select>
          </FormControl>
        )}
        <FormControl
          label="GitLab Project"
          className='mt-4'
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

GitLabCreateIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);