import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import { Button, Card, CardTitle, FormControl, Select, SelectItem } from '../../../components/v2';
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from '../../../hooks/api/integrationAuth';
import { useGetWorkspaceById } from '../../../hooks/api/workspace';
import createIntegration from '../../api/integrations/createIntegration';

export default function ChecklyCreateIntegrationPage() {
  const router = useRouter();

  const { integrationAuthId } = queryString.parse(router.asPath.split('?')[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem('projectData.id') ?? '');
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? '');
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ''
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState('');
  const [targetApp, setTargetApp] = useState('');
  const [targetAppId, setTargetAppId] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    // TODO: handle case where apps can be empty
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetApp(integrationAuthApps[0].name);
        setTargetAppId(String(integrationAuthApps[0].appId));
      } else {
        setTargetApp('none');
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
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: null,
        targetEnvironmentId: null,
        targetService: null,
        targetServiceId: null,
        owner: null,
        path: null,
        region: null
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem('projectData.id')}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetApp ? (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-mineshaft-900 to-bunker-900">
      <Card className="max-w-lg rounded-md p-0 border border-mineshaft-600">
        <CardTitle className="text-left px-6" subTitle="Choose which environment in Infisical you want to sync with your Checkly account.">Checkly Integration</CardTitle>
        <FormControl label="Infisical Project Environment" className="mt-2 px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {workspace?.environments.map((sourceEnvironment) => (
              <SelectItem
                value={sourceEnvironment.slug}
                key={`source-environment-${sourceEnvironment.slug}`}
              >
                {sourceEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl label="Checkly Account" className="mt-4 px-6">
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem
                  value={integrationAuthApp.name}
                  key={`target-app-${integrationAuthApp.name}`}
                >
                  {integrationAuthApp.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-app-none">
                No apps found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mt-2 mb-6 ml-auto mr-6"
          isFullWidth={false}
          isLoading={isLoading}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
}

ChecklyCreateIntegrationPage.requireAuth = true;
