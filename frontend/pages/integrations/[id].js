import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  faArrowRight,
  faCheck,
  faRotate,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '~/components/basic/buttons/Button';
import ListBox from '~/components/basic/Listbox';
import NavHeader from '~/components/navigation/NavHeader';
import getSecretsForProject from '~/components/utilities/secrets/getSecretsForProject';
import pushKeysIntegration from '~/components/utilities/secrets/pushKeysIntegration';
import guidGenerator from '~/utilities/randomId';

import {
  envMapping,
  frameworks,
  reverseEnvMapping
} from '../../public/data/frequentConstants';
import deleteIntegration from '../api/integrations/DeleteIntegration';
import deleteIntegrationAuth from '../api/integrations/DeleteIntegrationAuth';
import getIntegrationApps from '../api/integrations/GetIntegrationApps';
import getIntegrations from '../api/integrations/GetIntegrations';
import getWorkspaceAuthorizations from '../api/integrations/getWorkspaceAuthorizations';
import getWorkspaceIntegrations from '../api/integrations/getWorkspaceIntegrations';
import startIntegration from '../api/integrations/StartIntegration';

const crypto = require('crypto');

const Integration = ({ projectIntegration }) => {
  const [integrationEnvironment, setIntegrationEnvironment] = useState(
    reverseEnvMapping[projectIntegration.environment]
  );
  const [fileState, setFileState] = useState([]);
  const [data, setData] = useState();
  const [isKeyAvailable, setIsKeyAvailable] = useState(true);
  const router = useRouter();
  const [apps, setApps] = useState([]);
  const [integrationApp, setIntegrationApp] = useState(
    projectIntegration.app ? projectIntegration.app : apps[0]
  );

  useEffect(async () => {
    const tempHerokuApps = await getIntegrationApps({
      integrationAuthId: projectIntegration.integrationAuth
    });
    const tempHerokuAppNames = tempHerokuApps.map((app) => app.name);
    setApps(tempHerokuAppNames);
    setIntegrationApp(
      projectIntegration.app ? projectIntegration.app : tempHerokuAppNames[0]
    );
  }, []);

  return (
    <div className="flex flex-col max-w-5xl justify-center bg-white/5 p-6 rounded-md mx-6 mt-8">
      <div className="relative px-4 flex flex-row items-center justify-between mb-4">
        <div className="flex flex-row">
          <div>
            <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
              ENVIRONMENT
            </div>
            <ListBox
              data={
                !projectIntegration.isActive && [
                  'Development',
                  'Staging',
                  'Production'
                ]
              }
              selected={integrationEnvironment}
              onChange={setIntegrationEnvironment}
            />
          </div>
          <FontAwesomeIcon
            icon={faArrowRight}
            className="mx-4 text-gray-400 mt-8"
          />
          <div className="mr-2">
            <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
              INTEGRATION
            </div>
            <div className="py-2.5 bg-white/[.07] rounded-md pl-4 pr-20 text-sm font-semibold text-gray-300">
              {projectIntegration.integration.charAt(0).toUpperCase() +
                projectIntegration.integration.slice(1)}
            </div>
          </div>
          <div>
            <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
              HEROKU APP
            </div>
            <ListBox
              data={!projectIntegration.isActive && apps}
              selected={integrationApp}
              onChange={setIntegrationApp}
            />
          </div>
        </div>
        <div className="flex flex-row mt-6">
          {projectIntegration.isActive ? (
            <div className="max-w-5xl flex flex-row items-center bg-white/5 p-2 rounded-md px-4">
              <FontAwesomeIcon
                icon={faRotate}
                className="text-lg mr-2.5 text-primary animate-spin"
              />
              <div className="text-gray-300 font-semibold">In Sync</div>
            </div>
          ) : (
            <Button
              text="Start Integration"
              onButtonPressed={async () => {
                const result = await startIntegration({
                  integrationId: projectIntegration._id,
                  environment: envMapping[integrationEnvironment],
                  appName: integrationApp
                });
                if (result?.status == 200) {
                  let currentSecrets = await getSecretsForProject({
                    env: integrationEnvironment,
                    setFileState,
                    setIsKeyAvailable,
                    setData,
                    workspaceId: router.query.id
                  });

                  let obj = Object.assign(
                    {},
                    ...currentSecrets.map((row) => ({
                      [row.key]: row.value
                    }))
                  );
                  await pushKeysIntegration({
                    obj,
                    integrationId: projectIntegration._id
                  });
                  router.reload();
                }
              }}
              color="mineshaft"
              size="md"
            />
          )}
          <div className="opacity-50 hover:opacity-100 duration-200 ml-2">
            <Button
              onButtonPressed={async () => {
                await deleteIntegration({
                  integrationId: projectIntegration._id
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
    </div>
  );
};

export default function Integrations() {
  const [integrations, setIntegrations] = useState();
  const [projectIntegrations, setProjectIntegrations] = useState();
  const [authorizations, setAuthorizations] = useState();
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(async () => {
    const tempCSRFToken = crypto.randomBytes(16).toString('hex');
    setCsrfToken(tempCSRFToken);
    localStorage.setItem('latestCSRFToken', tempCSRFToken);

    let projectAuthorizations = await getWorkspaceAuthorizations({
      workspaceId: router.query.id
    });
    setAuthorizations(projectAuthorizations);

    const projectIntegrations = await getWorkspaceIntegrations({
      workspaceId: router.query.id
    });
    setProjectIntegrations(projectIntegrations);

    try {
      const integrationsData = await getIntegrations();
      setIntegrations(integrationsData);
    } catch (error) {
      console.log('Error', error);
    }
  }, []);

  return integrations ? (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>Dashboard</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta
          name="og:description"
          content="Infisical a simple end-to-end encrypted platform that enables teams to sync and manage their .env files."
        />
      </Head>
      <div className="flex flex-row">
        <div className="w-full max-h-96 pb-2 h-screen max-h-[calc(100vh-10px)] overflow-y-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
          <NavHeader pageName="Project Integrations" isProjectRelated={true} />
          <div className="flex flex-col justify-between items-start mx-4 mt-6 mb-4 text-xl max-w-5xl px-2">
            <div className="flex flex-row justify-start items-center text-3xl">
              <p className="font-semibold mr-4">Current Project Integrations</p>
            </div>
            <p className="mr-4 text-base text-gray-400">
              Manage your integrations of Infisical with third-party services.
            </p>
          </div>
          {projectIntegrations.length > 0 ? (
            projectIntegrations.map((projectIntegration) => (
              <Integration
                key={guidGenerator()}
                projectIntegration={projectIntegration}
              />
            ))
          ) : (
            <div className="flex flex-col max-w-5xl justify-center bg-white/5 p-6 rounded-md mx-6 mt-8">
              <div className="relative px-4 flex flex-col text-gray-400 items-center justify-center">
                <div className="mb-1">
                  You {"don't"} have any integrations set up yet. When you do,
                  they will appear here.
                </div>
                <div className="">
                  To start, click on any of the options below. It takes 5 clicks
                  to set up.
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col justify-between items-start mx-4 mt-12 mb-4 text-xl max-w-5xl px-2">
            <div className="flex flex-row justify-start items-center text-3xl">
              <p className="font-semibold mr-4">
                Platform & Cloud Integrations
              </p>
            </div>
            <p className="mr-4 text-base text-gray-400">
              Click on the itegration you want to connect. This will let your
              environment variables flow automatically into selected third-party
              services.
            </p>
            <p className="mr-4 text-xs text-gray-600 mt-1">
              Note: during an integration with Heroku, for security reasons, it
              is impossible to maintain end-to-end encryption. In theory, this
              lets Infisical decrypt yor environment variables. In practice, we
              can assure you that this will never be done, and it allows us to
              protect your secrets from bad actors online. The core Infisical
              service will always stay end-to-end encrypted. With any questions,
              reach out support@infisical.com.
            </p>
          </div>
          <div className="grid gap-4 grid-cols-4 grid-rows-2 mx-6 mt-4 max-w-5xl">
            {Object.keys(integrations).map((integration) => (
              <div
                className={`relative ${
                  ['Heroku'].includes(integrations[integration].name)
                    ? ''
                    : 'opacity-50'
                }`}
                key={integrations[integration].name}
              >
                <a
                  href={`${
                    ['Heroku'].includes(integrations[integration].name)
                      ? `https://id.heroku.com/oauth/authorize?client_id=bc132901-935a-4590-b010-f1857efc380d&response_type=code&scope=write-protected&state=${csrfToken}`
                      : '#'
                  }`}
                  rel="noopener"
                  className={`relative flex flex-row bg-white/5 h-32 rounded-md p-4 items-center ${
                    ['Heroku'].includes(integrations[integration].name)
                      ? 'hover:bg-white/10 duration-200 cursor-pointer'
                      : 'cursor-default grayscale'
                  }`}
                >
                  <Image
                    src={`/images/integrations/${integrations[integration].name}.png`}
                    height={70}
                    width={70}
                    alt="integration logo"
                  ></Image>
                  {integrations[integration].name.split(' ').length > 2 ? (
                    <div className="font-semibold text-gray-300 group-hover:text-gray-200 duration-200 text-3xl ml-4 max-w-xs">
                      <div>{integrations[integration].name.split(' ')[0]}</div>
                      <div className="text-base">
                        {integrations[integration].name.split(' ')[1]}{' '}
                        {integrations[integration].name.split(' ')[2]}
                      </div>
                    </div>
                  ) : (
                    <div className="font-semibold text-gray-300 group-hover:text-gray-200 duration-200 text-xl ml-4 max-w-xs">
                      {integrations[integration].name}
                    </div>
                  )}
                </a>
                {['Heroku'].includes(integrations[integration].name) &&
                  authorizations
                    .map((authorization) => authorization.integration)
                    .includes(integrations[integration].name.toLowerCase()) && (
                    <div className="absolute group z-50 top-0 right-0 flex flex-row">
                      <div
                        onClick={() => {
                          deleteIntegrationAuth({
                            integrationAuthId: authorizations
                              .filter(
                                (authorization) =>
                                  authorization.integration ==
                                  integrations[integration].name.toLowerCase()
                              )
                              .map((authorization) => authorization._id)[0]
                          });
                          router.reload();
                        }}
                        className="cursor-pointer w-max bg-red py-0.5 px-2 rounded-b-md text-xs flex flex-row items-center opacity-0 group-hover:opacity-100 duration-200"
                      >
                        <FontAwesomeIcon
                          icon={faX}
                          className="text-xs mr-2 py-px"
                        />
                        Revoke
                      </div>
                      <div className="w-max bg-primary py-0.5 px-2 rounded-bl-md rounded-tr-md text-xs flex flex-row items-center text-black opacity-90 group-hover:opacity-100 duration-200">
                        <FontAwesomeIcon
                          icon={faCheck}
                          className="text-xs mr-2"
                        />
                        Authorized
                      </div>
                    </div>
                  )}
                {!['Heroku'].includes(integrations[integration].name) && (
                  <div className="absolute group z-50 top-0 right-0 flex flex-row">
                    <div className="w-max bg-yellow py-0.5 px-2 rounded-bl-md rounded-tr-md text-xs flex flex-row items-center text-black opacity-90">
                      Coming Soon
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-between items-start mx-4 mt-12 mb-4 text-xl max-w-5xl px-2">
            <div className="flex flex-row justify-start items-center text-3xl">
              <p className="font-semibold mr-4">Framework Integrations</p>
            </div>
            <p className="mr-4 text-base text-gray-400">
              Click on a framework to get the setup instructions.
            </p>
          </div>
          <div className="grid gap-4 grid-cols-7 grid-rows-2 mx-6 mt-4 max-w-5xl">
            {frameworks.map((framework) => (
              <div key={framework.name}>
                <a
                  href={framework.link}
                  rel="noopener"
                  className={`relative flex flex-row items-center justify-center bg-bunker-500 hover:bg-gradient-to-tr hover:from-sky-400 hover:to-primary duration-200 h-32 rounded-md p-0.5 items-center cursor-pointer`}
                >
                  <div
                    className={`font-semibold bg-bunker-500 flex flex-col items-center justify-center h-full w-full rounded-md text-gray-300 group-hover:text-gray-200 duration-200 ${
                      framework?.name?.split(' ').length > 1
                        ? 'text-sm px-1'
                        : 'text-xl px-2'
                    } text-center w-full max-w-xs`}
                  >
                    {framework?.image && (
                      <Image
                        src={`/images/integrations/${framework.image}.png`}
                        height={framework?.name ? 60 : 90}
                        width={framework?.name ? 60 : 90}
                        alt="integration logo"
                      ></Image>
                    )}
                    {framework?.name && framework?.image && (
                      <div className="h-2"></div>
                    )}
                    {framework?.name && framework.name}
                  </div>
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="relative z-10 w-10/12 mr-auto h-full ml-2 bg-bunker-800 flex flex-col items-center justify-center">
      <div className="absolute top-0 bg-bunker h-14 border-b border-mineshaft-700 w-full"></div>
      <Image
        src="/images/loading/loading.gif"
        height={70}
        width={120}
        alt="loading animation"
      ></Image>
    </div>
  );
}

Integrations.requireAuth = true;
