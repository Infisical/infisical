/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { faArrowRight, faRotate, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// TODO: This needs to be moved from public folder
import { contextNetlifyMapping, reverseContextNetlifyMapping } from 'public/data/frequentConstants';

import Button from '@app/components/basic/buttons/Button';
import ListBox from '@app/components/basic/Listbox';

import deleteIntegration from '../../pages/api/integrations/DeleteIntegration';
import getIntegrationApps from '../../pages/api/integrations/GetIntegrationApps';
import updateIntegration from '../../pages/api/integrations/updateIntegration';

interface TIntegration {
  _id: string;
  app?: string;
  target?: string;
  environment: string;
  integration: string;
  integrationAuth: string;
  isActive: boolean;
  context: string;
}

interface IntegrationApp {
  name: string;
  siteId: string;
}

type Props = {
  integration: TIntegration;
  environments: Array<{ name: string; slug: string }>;
};

const Integration = ({ integration, environments = [] }: Props) => {
  // set initial environment. This find will only execute when component is mounting
  const [integrationEnvironment, setIntegrationEnvironment] = useState<Props['environments'][0]>(
    environments.find(({ slug }) => slug === integration.environment) || {
      name: '',
      slug: ''
    }
  );
  const [fileState, setFileState] = useState([]);
  const router = useRouter();
  const [apps, setApps] = useState<IntegrationApp[]>([]); // integration app objects
  const [integrationApp, setIntegrationApp] = useState(''); // integration app name
  const [integrationTarget, setIntegrationTarget] = useState(''); // vercel-specific integration param
  const [integrationContext, setIntegrationContext] = useState(''); // netlify-specific integration param

  useEffect(() => {
    const loadIntegration = async () => {
      interface App {
        name: string;
        siteId?: string;
      }

      const tempApps: [IntegrationApp] = await getIntegrationApps({
        integrationAuthId: integration.integrationAuth
      });

      setApps(tempApps);
      setIntegrationApp(integration.app ? integration.app : tempApps[0].name);

      switch (integration.integration) {
        case 'vercel':
          setIntegrationTarget(
            integration?.target
              ? integration.target.charAt(0).toUpperCase() + integration.target.substring(1)
              : 'Development'
          );
          break;
        case 'netlify':
          setIntegrationContext(
            integration?.context ? contextNetlifyMapping[integration.context] : 'Local development'
          );
          break;
        default:
          break;
      }
    };

    loadIntegration();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const renderIntegrationSpecificParams = (integration: TIntegration) => {
    try {
      switch (integration.integration) {
        case 'vercel':
          return (
            <div>
              <div className="text-gray-400 text-xs font-semibold mb-2 w-60">ENVIRONMENT</div>
              <ListBox
                data={!integration.isActive ? ['Development', 'Preview', 'Production'] : null}
                selected={integrationTarget}
                onChange={setIntegrationTarget}
                isFull
              />
            </div>
          );
        case 'netlify':
          return (
            <div>
              <div className="text-gray-400 text-xs font-semibold mb-2">CONTEXT</div>
              <ListBox
                data={
                  !integration.isActive
                    ? ['Production', 'Deploy previews', 'Branch deploys', 'Local development']
                    : null
                }
                selected={integrationContext}
                onChange={setIntegrationContext}
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

  if (!integrationApp || apps.length === 0) return <div />;

  return (
    <div className="max-w-5xl p-6 mx-6 mb-8 rounded-md bg-white/5 flex justify-between">
      <div className="flex">
        <div>
          <p className="text-gray-400 text-xs font-semibold mb-2">ENVIRONMENT</p>
          <ListBox
            data={!integration.isActive ? environments.map(({ name }) => name) : null}
            selected={integrationEnvironment.name}
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
          <FontAwesomeIcon icon={faArrowRight} className="mx-4 text-gray-400 mt-8" />
        </div>
        <div className="mr-2">
          <p className="text-gray-400 text-xs font-semibold mb-2">INTEGRATION</p>
          <div className="py-2.5 bg-white/[.07] rounded-md pl-4 pr-10 text-sm font-semibold text-gray-300">
            {integration.integration.charAt(0).toUpperCase() + integration.integration.slice(1)}
          </div>
        </div>
        <div className="mr-2">
          <div className="text-gray-400 text-xs font-semibold mb-2">APP</div>
          <ListBox
            data={!integration.isActive ? apps.map((app) => app.name) : null}
            selected={integrationApp}
            onChange={(app) => {
              setIntegrationApp(app);
            }}
          />
        </div>
        {renderIntegrationSpecificParams(integration)}
      </div>
      <div className="flex items-end">
        {integration.isActive ? (
          <div className="max-w-5xl flex flex-row items-center bg-white/5 p-2 rounded-md px-4">
            <FontAwesomeIcon icon={faRotate} className="text-lg mr-2.5 text-primary animate-spin" />
            <div className="text-gray-300 font-semibold">In Sync</div>
          </div>
        ) : (
          <Button
            text="Start Integration"
            onButtonPressed={async () => {
              const siteApp = apps.find((app) => app.name === integrationApp); // obj or undefined
              const siteId = siteApp?.siteId ? siteApp.siteId : null;

              await updateIntegration({
                integrationId: integration._id,
                environment: integrationEnvironment.slug,
                app: integrationApp,
                isActive: true,
                target: integrationTarget ? integrationTarget.toLowerCase() : null,
                context: integrationContext
                  ? reverseContextNetlifyMapping[integrationContext]
                  : null,
                siteId
              });

              router.reload();
            }}
            color="mineshaft"
            size="md"
          />
        )}
        <div className="opacity-50 hover:opacity-100 duration-200 ml-2">
          <Button
            onButtonPressed={async () => {
              await deleteIntegration({
                integrationId: integration._id
              });
              router.reload();
            }}
            color="red"
            size="icon-md"
            icon={faX}
          />
        </div>
      </div>
    </div>
  );
};

export default Integration;
