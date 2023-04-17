/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { faArrowRight, faRotate, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// TODO: This needs to be moved from public folder
import { contextNetlifyMapping, integrationSlugNameMapping, reverseContextNetlifyMapping } from 'public/data/frequentConstants';

import Button from '@app/components/basic/buttons/Button';
import ListBox from '@app/components/basic/Listbox';

import deleteIntegration from '../../pages/api/integrations/DeleteIntegration';
import getIntegrationApps from '../../pages/api/integrations/GetIntegrationApps';
import updateIntegration from '../../pages/api/integrations/updateIntegration';

interface Integration {
  _id: string;
  isActive: boolean;
  app: string | null;
  appId: string | null;
  path: string | null;
  region: string | null;
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

type Props = {
  integration: Integration;
  integrations: Integration[];
  setIntegrations: any;
  bot: any;
  setBot: any;
  environments: Array<{ name: string; slug: string }>;
  handleDeleteIntegration: (args: { integration: Integration }) => void;
};

// TODO: refactor
const IntegrationTile = ({
  integration,
  integrations,
  bot,
  setBot,
  setIntegrations,
  environments = [],
  handleDeleteIntegration
}: Props) => {

  const [integrationEnvironment, setIntegrationEnvironment] = useState<Props['environments'][0]>(
    environments.find(({ slug }) => slug === integration?.environment) || {
      name: '',
      slug: ''
    }
  );
  const router = useRouter();
  const [apps, setApps] = useState<IntegrationApp[]>([]); // integration app objects
  const [integrationApp, setIntegrationApp] = useState(''); // integration app name
  const [integrationTargetEnvironment, setIntegrationTargetEnvironment] = useState('');

  useEffect(() => {
    const loadIntegration = async () => {
      const tempApps: [IntegrationApp] = await getIntegrationApps({
        integrationAuthId: integration?.integrationAuth
      }) || [];

      setApps(tempApps);
      
      if (integration?.app) {
        setIntegrationApp(integration.app);
      } else if (integration?.path && integration?.region) {
        setIntegrationApp(`${integration.path} (${integration.region})`);
      } else if (tempApps.length > 0) {
          setIntegrationApp(tempApps[0].name)
        } else {
          setIntegrationApp('');
        }

      switch (integration.integration) {
        case 'vercel':
          setIntegrationTargetEnvironment(
            integration?.targetEnvironment
              ? integration.targetEnvironment.charAt(0).toUpperCase() +
                  integration.targetEnvironment.substring(1)
              : 'Development'
          );
          break;
        case 'netlify':
          setIntegrationTargetEnvironment(
            integration?.targetEnvironment
              ? contextNetlifyMapping[integration.targetEnvironment]
              : 'Local development'
          );
          break;
        default:
          break;
      }
    };

    loadIntegration();
  }, []);

  const handleStartIntegration = async () => {
    const reformatTargetEnvironment = (targetEnvironment: string) => {
      switch (integration.integration) {
        case 'vercel':
          return targetEnvironment.toLowerCase();
        case 'netlify':
          return reverseContextNetlifyMapping[targetEnvironment];
        default:
          return null;
      }
    };

    try {
      const siteApp = apps.find((app) => app.name === integrationApp); // obj or undefined
      const appId = siteApp?.appId ?? null;
      const owner = siteApp?.owner ?? null;

      // return updated integration
      const updatedIntegration = await updateIntegration({
        integrationId: integration._id,
        environment: integrationEnvironment.slug,
        isActive: true,
        app: integrationApp,
        appId,
        targetEnvironment: reformatTargetEnvironment(integrationTargetEnvironment),
        owner
      });

      setIntegrations(
        integrations.map((i) => (i._id === updatedIntegration._id ? updatedIntegration : i))
      );
    } catch (err) {
      console.error(err);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const renderIntegrationSpecificParams = (integration: Integration) => {
    try {
      switch (integration.integration) {
        case 'vercel':
          return (
            <div>
              <div className="mb-2 w-60 text-xs font-semibold text-gray-400">ENVIRONMENT</div>
              <ListBox
                data={!integration.isActive ? ['Development', 'Preview', 'Production'] : null}
                isSelected={integrationTargetEnvironment}
                onChange={setIntegrationTargetEnvironment}
                isFull
              />
            </div>
          );
        case 'netlify':
          return (
            <div>
              <div className="mb-2 text-xs font-semibold text-gray-400">CONTEXT</div>
              <ListBox
                data={
                  !integration.isActive
                    ? ['Production', 'Deploy previews', 'Branch deploys', 'Local development']
                    : null
                }
                isSelected={integrationTargetEnvironment}
                onChange={setIntegrationTargetEnvironment}
              />
            </div>
          );
        case 'railway':
          return (
            <div>
              <div className="mb-2 text-xs font-semibold text-gray-400">ENVIRONMENT</div>
              <ListBox
                data={
                  !integration.isActive
                    ? ['Production', 'Deploy previews', 'Branch deploys', 'Local development']
                    : null
                }
                isSelected={integration.targetEnvironment}
                onChange={setIntegrationTargetEnvironment}
              />
            </div>
          );
        default:
          return <div />;
      }
    } catch (err) {
      console.error(err);
    }

    return <div />;
  };

  if (!integrationApp) return <div />;

  return (
    <div className="mx-6 mb-8 flex max-w-5xl justify-between rounded-md bg-white/5 p-6">
      <div className="flex">
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-400">ENVIRONMENT</p>
          <ListBox
            data={!integration.isActive ? environments.map(({ name }) => name) : null}
            isSelected={integrationEnvironment.name}
            onChange={(envName) =>
              setIntegrationEnvironment(
                environments.find(({ name }) => envName === name) || {
                  name: 'unknown',
                  slug: 'unknown'
                }
              )
            }
            isFull
          />
        </div>
        <div className="pt-2">
          <FontAwesomeIcon icon={faArrowRight} className="mx-4 mt-8 text-gray-400" />
        </div>
        <div className="mr-2">
          <p className="text-gray-400 text-xs font-semibold mb-2">INTEGRATION</p>
          <div className="py-2.5 bg-white/[.07] rounded-md pl-4 pr-10 text-sm font-semibold text-gray-300">
            {/* {integration.integration.charAt(0).toUpperCase() + integration.integration.slice(1)} */}
            {integrationSlugNameMapping[integration.integration]}
          </div>
        </div>
        <div className="mr-2">
          <div className="mb-2 text-xs font-semibold text-gray-400">APP</div>
          <ListBox
            data={!integration.isActive ? apps.map((app) => app.name) : null}
            isSelected={integrationApp}
            onChange={(app) => {
              setIntegrationApp(app);
            }}
          />
        </div>
        {renderIntegrationSpecificParams(integration)}
      </div>
      <div className="flex items-end">
        {integration.isActive ? (
          <div className="flex max-w-5xl flex-row items-center rounded-md bg-white/5 p-2 px-4">
            <FontAwesomeIcon icon={faRotate} className="mr-2.5 animate-spin text-lg text-primary" />
            <div className="font-semibold text-gray-300">In Sync</div>
          </div>
        ) : (
          <Button
            text="Start Integration"
            onButtonPressed={() => handleStartIntegration()}
            color="mineshaft"
            size="md"
          />
        )}
        <div className="ml-2 opacity-50 duration-200 hover:opacity-100">
          <Button
            onButtonPressed={() =>
              handleDeleteIntegration({
                integration
              })
            }
            color="red"
            size="icon-md"
            icon={faX}
          />
        </div>
      </div>
    </div>
  );
};

export default IntegrationTile;
