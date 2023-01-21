import crypto from 'crypto';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import frameworkIntegrationOptions from 'public/json/frameworkIntegrations.json';

import ActivateBotDialog from '@app/components/basic/dialog/ActivateBotDialog';
import IntegrationAccessTokenDialog from '@app/components/basic/dialog/IntegrationAccessTokenDialog';
import CloudIntegrationSection from '@app/components/integrations/CloudIntegrationSection';
import FrameworkIntegrationSection from '@app/components/integrations/FrameworkIntegrationSection';
import IntegrationSection from '@app/components/integrations/IntegrationSection';
import NavHeader from '@app/components/navigation/NavHeader';
import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';

import {
  decryptAssymmetric,
  encryptAssymmetric
} from '../../components/utilities/cryptography/crypto';
import getBot from '../api/bot/getBot';
import setBotActiveStatus from '../api/bot/setBotActiveStatus';
import createIntegration from '../api/integrations/createIntegration';
import deleteIntegration from '../api/integrations/DeleteIntegration';
import getIntegrationOptions from '../api/integrations/GetIntegrationOptions';
import getWorkspaceAuthorizations from '../api/integrations/getWorkspaceAuthorizations';
import getWorkspaceIntegrations from '../api/integrations/getWorkspaceIntegrations';
import saveIntegrationAccessToken from '../api/integrations/saveIntegrationAccessToken';
import getAWorkspace from '../api/workspace/getAWorkspace';
import getLatestFileKey from '../api/workspace/getLatestFileKey';

interface IntegrationAuth {
  _id: string;
  integration: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
}

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

interface IntegrationOption {
  clientId: string;
  clientSlug?: string; // vercel-integration specific
  docsLink: string;
  image: string;
  isAvailable: boolean;
  name: string;
  slug: string;
  type: string;
}

export default function Integrations() {
  const [cloudIntegrationOptions, setCloudIntegrationOptions] = useState([]);
  const [integrationAuths, setIntegrationAuths] = useState<IntegrationAuth[]>([]);
  const [environments, setEnvironments] = useState<
    {
      name: string;
      slug: string;
    }[]
  >([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  // TODO: These will have its type when migratiing towards react-query
  const [bot, setBot] = useState<any>(null);
  const [isActivateBotDialogOpen, setIsActivateBotDialogOpen] = useState(false);
  const [isIntegrationAccessTokenDialogOpen, setIntegrationAccessTokenDialogOpen] = useState(false);
  const [selectedIntegrationOption, setSelectedIntegrationOption] = useState<IntegrationOption | null>(null);

  const router = useRouter();
  const workspaceId = router.query.id as string;

  const { t } = useTranslation();

  useEffect(() => {
    (async () => {
      try {
        const workspace = await getAWorkspace(workspaceId);
        setEnvironments(workspace.environments);

        // get cloud integration options
        setCloudIntegrationOptions(await getIntegrationOptions());

        // get project integration authorizations
        setIntegrationAuths(
          await getWorkspaceAuthorizations({
            workspaceId
          })
        );

        // get project integrations
        setIntegrations(
          await getWorkspaceIntegrations({
            workspaceId
          })
        );

        // get project bot
        setBot(await getBot({ workspaceId }));
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  /**
   * Activate bot for project by performing the following steps:
   * 1. Get the (encrypted) project key
   * 2. Decrypt project key with user's private key
   * 3. Encrypt project key with bot's public key
   * 4. Send encrypted project key to backend and set bot status to active
   */
  const handleBotActivate = async () => {
    let botKey;
    try {
      if (bot) {
        // case: there is a bot
        const key = await getLatestFileKey({ workspaceId });
        const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');

        if (!PRIVATE_KEY) {
          throw new Error('Private Key missing');
        }

        const WORKSPACE_KEY = decryptAssymmetric({
          ciphertext: key.latestKey.encryptedKey,
          nonce: key.latestKey.nonce,
          publicKey: key.latestKey.sender.publicKey,
          privateKey: PRIVATE_KEY
        });

        const { ciphertext, nonce } = encryptAssymmetric({
          plaintext: WORKSPACE_KEY,
          publicKey: bot.publicKey,
          privateKey: PRIVATE_KEY
        });

        botKey = {
          encryptedKey: ciphertext,
          nonce
        };

        setBot(
          (
            await setBotActiveStatus({
              botId: bot._id,
              isActive: true,
              botKey
            })
          ).bot
        );
      }
    } catch (err) {
      console.error(err);
    }
  };
  
  /**
   * Handle integration option authorization for a given integration option [integrationOption]
   * @param {Object} obj
   * @param {Object} obj.integrationOption - an integration option
   * @param {String} obj.name
   * @param {String} obj.type
   * @param {String} obj.docsLink
   * @returns
   */
  const handleIntegrationOption = async ({
    integrationOption,
    accessToken
  }: { 
    integrationOption: IntegrationOption,
    accessToken?: string;
  }) => {
    try {
      if (integrationOption.type === 'oauth') {
        // integration is of type OAuth

        // generate CSRF token for OAuth2 code-token exchange integrations
        const state = crypto.randomBytes(16).toString('hex');
        localStorage.setItem('latestCSRFToken', state);

        switch (integrationOption.slug) {
          case 'heroku':
            window.location.assign(
              `https://id.heroku.com/oauth/authorize?client_id=${integrationOption.clientId}&response_type=code&scope=write-protected&state=${state}`
            );
            break;
          case 'vercel':
            window.location.assign(
              `https://vercel.com/integrations/${integrationOption.clientSlug}/new?state=${state}`
            );
            break;
          case 'netlify':
            window.location.assign(
              `https://app.netlify.com/authorize?client_id=${integrationOption.clientId}&response_type=code&state=${state}&redirect_uri=${window.location.origin}/netlify`
            );
            break;
          case 'github':
            window.location.assign(
              `https://github.com/login/oauth/authorize?client_id=${integrationOption.clientId}&response_type=code&scope=repo&redirect_uri=${window.location.origin}/github&state=${state}`
            );
            break;
          default:
            break;
        }
        return;
      } if (integrationOption.type === 'pat') {
        // integration is of type personal access token
        const integrationAuth = await saveIntegrationAccessToken({
            workspaceId: localStorage.getItem('projectData.id'),
            integration: integrationOption.slug,
            accessToken: accessToken ?? ''
        });

        setIntegrationAuths([...integrationAuths, integrationAuth])

        const integration = await createIntegration({
          integrationAuthId: integrationAuth._id
        });
        
        setIntegrations([...integrations, integration]); 
        return;
      }
    } catch (err) {
      console.log(err);
    }
  };
  
  /**
   * Open dialog to activate bot if bot is not active.
   * Otherwise, start integration [integrationOption]
   * @param {Object} integrationOption - an integration option
   * @param {String} integrationOption.name
   * @param {String} integrationOption.type
   * @param {String} integrationOption.docsLink
   * @returns
   */
  const integrationOptionPress = async (integrationOption: IntegrationOption) => {
    try {
      const integrationAuthX = integrationAuths.find((integrationAuth) => integrationAuth.integration === integrationOption.slug);
      
      if (!integrationAuthX) {
        // case: integration has not been authorized before
        
        if (integrationOption.type === 'pat') {
          // case: integration requires user to input their personal access token for that integration
          setIntegrationAccessTokenDialogOpen(true);
          return;
        }
        
        // case: integration does not require user to input their personal access token (i.e. it's an OAuth2 integration)
        handleIntegrationOption({ integrationOption });
        return;
      }
      
      // case: integration has been authorized before
      // -> create new integration
      const integration = await createIntegration({
        integrationAuthId: integrationAuthX._id
      });
      
      setIntegrations([...integrations, integration]);
    } catch (err) {
      console.error(err);
    }
  };
  
  /**
   * Handle deleting integration authorization [integrationAuth] and corresponding integrations from state where applicable
   * @param {Object} obj
   * @param {IntegrationAuth} obj.integrationAuth - integrationAuth to delete
   */
  const handleDeleteIntegrationAuth = async ({ integrationAuth: deletedIntegrationAuth }: { integrationAuth: IntegrationAuth }) => {
    try {
      const newIntegrations = integrations.filter((integration) => integration.integrationAuth !== deletedIntegrationAuth._id);
      setIntegrationAuths(integrationAuths.filter((integrationAuth) => integrationAuth._id !== deletedIntegrationAuth._id));
      setIntegrations(newIntegrations);
      
      // handle updating bot
      if (newIntegrations.length < 1) {
        // case: no integrations left
        setBot(
            (
              await setBotActiveStatus({
                botId: bot._id,
                isActive: false
              })
            ).bot
          );
      }
    } catch (err) {
      console.error(err);
    }
  }
  
  /**
   * Handle deleting integration [integration]
   * @param {Object} obj
   * @param {Integration} obj.integration - integration to delete
   */
  const handleDeleteIntegration = async ({ integration }: { integration: Integration }) => {
    try {
      const deletedIntegration = await deleteIntegration({
        integrationId: integration._id
      });
      
      const newIntegrations = integrations.filter((i) => i._id !== deletedIntegration._id);
      setIntegrations(newIntegrations);

      // handle updating bot
      if (newIntegrations.length < 1) {
        // case: no integrations left
        setBot(
            (
              await setBotActiveStatus({
                botId: bot._id,
                isActive: false
              })
            ).bot
          );
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>{t('common:head-title', { title: t('integrations:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t('integrations:description') as string} />
      </Head>
      <div className="w-full pb-2 h-screen max-h-[calc(100vh-10px)] overflow-y-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
        <NavHeader pageName={t('integrations:title')} isProjectRelated />
        <ActivateBotDialog
          isOpen={isActivateBotDialogOpen}
          closeModal={() => setIsActivateBotDialogOpen(false)}
          selectedIntegrationOption={selectedIntegrationOption}
          handleBotActivate={handleBotActivate}
          integrationOptionPress={integrationOptionPress}
        />
        <IntegrationAccessTokenDialog
          isOpen={isIntegrationAccessTokenDialogOpen}
          closeModal={() => setIntegrationAccessTokenDialogOpen(false)}
          selectedIntegrationOption={selectedIntegrationOption}
          handleIntegrationOption={handleIntegrationOption}
          
        />
        <IntegrationSection 
          integrations={integrations} 
          setIntegrations={setIntegrations}
          bot={bot}
          setBot={setBot}
          environments={environments} 
          handleDeleteIntegration={handleDeleteIntegration}
        />
        {cloudIntegrationOptions.length > 0 && bot ? (
          <CloudIntegrationSection
            cloudIntegrationOptions={cloudIntegrationOptions}
            setSelectedIntegrationOption={setSelectedIntegrationOption as any}
            integrationOptionPress={(integrationOption: IntegrationOption) => {
             if (!bot.isActive) {
                // case: bot is not active -> open modal to activate bot
                setIsActivateBotDialogOpen(true);
                return;
              } 
              integrationOptionPress(integrationOption)
            }}
            integrationAuths={integrationAuths}
            handleDeleteIntegrationAuth={handleDeleteIntegrationAuth}
          />
        ) : (
          <div />
        )}
        <FrameworkIntegrationSection frameworks={frameworkIntegrationOptions as any} />
      </div>
    </div>
  );
}

Integrations.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);
