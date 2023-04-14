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
import { useGetIntegrationAuthApps, useGetIntegrationAuthById } from '../../../hooks/api/integrationAuth';
import { useGetWorkspaceById } from '../../../hooks/api/workspace';
import createIntegration from "../../api/integrations/createIntegration";

export default function GCPSecretManagerCreateIntegrationPage() {
  const router = useRouter();

  const { integrationAuthId } = queryString.parse(router.asPath.split('?')[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem('projectData.id') ?? '');
  const { data: integrationAuth } = useGetIntegrationAuthById(integrationAuthId as string ?? '');
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({ integrationAuthId: integrationAuthId as string ?? '' });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState('');
  const [owner, setOwner] = useState<string | null>(null);
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
      setTargetApp(integrationAuthApps[0]?.name || 'none');
      setTargetAppId(integrationAuthApps[0]?.appId ?? '');
      setOwner(integrationAuthApps[0]?.owner ?? null);
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
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: null,
        targetEnvironmentId: null,
        targetService: null,
        targetServiceId: null,
        owner,
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
        <CardTitle className='text-center'>GCP Secret Manager Integration</CardTitle>
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
              <SelectItem value={sourceEnvironment.slug} key={`gcp-secret-manager-environment-${sourceEnvironment.slug}`}>
                {sourceEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          label="GCP Projects"
          className='mt-4'
        >
          <Select
            value={targetAppId}
            onValueChange={(val) => setTargetApp(val)}
            className='w-full border border-mineshaft-500'
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => integrationAuthApp.appId && (
                <SelectItem value={integrationAuthApp.appId} key={`gcp-secret-manager-environment-${integrationAuthApp.appId}`}>
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
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : <div />
}

GCPSecretManagerCreateIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);