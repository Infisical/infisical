import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Select,
  SelectItem
} from '../components/v2';
import AuthorizeIntegration from './api/integrations/authorizeIntegration';
import getIntegrationApps from './api/integrations/GetIntegrationApps';
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

interface IntegrationApp {
  name: string;
  appId?: string;
  owner?: string;
}

export default function Heroku() {
  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split('?')[1]);
  const { code } = parsedUrl;
  const { state } = parsedUrl;

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [environments, setEnvironments] = useState<
    {
      name: string;
      slug: string;
    }[]
  >([]);
  const [environment, setEnvironment] = useState('');
  const [app, setApp] = useState('');
  const [apps, setApps] = useState<IntegrationApp[]>([]);

  useEffect(() => {
    (async () => {
      try {
        if (state === localStorage.getItem('latestCSRFToken')) {
          localStorage.removeItem('latestCSRFToken');
          const integrationDetails = await AuthorizeIntegration({
            workspaceId: localStorage.getItem('projectData.id') as string,
            code: code as string,
            integration: 'heroku',
          });

          setIntegration(integrationDetails.integration);

          const workspaceId = localStorage.getItem('projectData.id');
          if (!workspaceId) return;

          const workspace = await getAWorkspace(workspaceId);
          setEnvironment(workspace.environments[0].slug);
          setEnvironments(workspace.environments);

          const tempApps: [IntegrationApp] = await getIntegrationApps({
            integrationAuthId: integrationDetails.integration.integrationAuth
          });
          
          console.log('tempApps: ', tempApps);
          setApp(tempApps[0].name);
          setApps(tempApps);
          
          // router.push(
          //   `/integrations/${  localStorage.getItem('projectData.id')}`
          // );
        }
      } catch (error) {
        console.error('Heroku integration error: ', error);
      }
    })();
  }, []);
  
  const handleButtonClick = async () => {
    try {
      console.log('handleButtonClick');
      console.log('project environment: ', environment);
      console.log('app', app);
    } catch (err) {
      console.error(err);
    }
  }
  
  console.log('integration: ', integration);
  console.log('environments: ', environments);
  console.log('apps: ', apps);

  return (integration && environments.length > 0 && apps.length > 0) ? (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>Heroku Integration</CardTitle>
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
              <SelectItem value={e.slug} key={`heroku-environment-${e.slug}`}>
                {e.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          label="Heroku App"
          className='mt-4'
        >
          <Select
            value={app}
            onValueChange={(val) => setApp(val)}
            className='w-full border border-mineshaft-500'
          >
            {apps.map((a) => (
              <SelectItem value={a.name} key={`heroku-environment-${a.name}`}>
                {a.name}
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
  ) : <div>Hello</div>
}

Heroku.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);