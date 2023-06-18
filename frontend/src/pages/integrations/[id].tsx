import crypto from 'crypto';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import frameworkIntegrationOptions from 'public/json/frameworkIntegrations.json';

import ActivateBotDialog from '@app/components/basic/dialog/ActivateBotDialog';
import CloudIntegrationSection from '@app/components/integrations/CloudIntegrationSection';
import FrameworkIntegrationSection from '@app/components/integrations/FrameworkIntegrationSection';
import IntegrationSection from '@app/components/integrations/IntegrationSection';
import NavHeader from '@app/components/navigation/NavHeader';

import {
  decryptAssymmetric,
  encryptAssymmetric
} from '../../components/utilities/cryptography/crypto';
import getBot from '../api/bot/getBot';
import setBotActiveStatus from '../api/bot/setBotActiveStatus';
import deleteIntegration from '../api/integrations/DeleteIntegration';
import getIntegrationOptions from '../api/integrations/GetIntegrationOptions';
import getWorkspaceAuthorizations from '../api/integrations/getWorkspaceAuthorizations';
import getWorkspaceIntegrations from '../api/integrations/getWorkspaceIntegrations';
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
  secretPath:string;
  integrationAuth: string;
}

interface IntegrationOption {
  tenantId?: string;
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
  const [selectedIntegrationOption, setSelectedIntegrationOption] =
    useState<IntegrationOption | null>(null);

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

  const handleUnauthorizedIntegrationOptionPress = (integrationOption: IntegrationOption) => {
    try {
      // generate CSRF token for OAuth2 code-token exchange integrations
      const state = crypto.randomBytes(16).toString('hex');
      localStorage.setItem('latestCSRFToken', state);

      let link = '';
      switch (integrationOption.slug) {
        case 'azure-key-vault':
          link = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${integrationOption.clientId}&response_type=code&redirect_uri=${window.location.origin}/integrations/azure-key-vault/oauth2/callback&response_mode=query&scope=https://vault.azure.net/.default openid offline_access&state=${state}`;
          break;
        case 'aws-parameter-store':
          link = `${window.location.origin}/integrations/aws-parameter-store/authorize`;
          break;
        case 'aws-secret-manager':
          link = `${window.location.origin}/integrations/aws-secret-manager/authorize`;
          break;
        case 'heroku':
          link = `https://id.heroku.com/oauth/authorize?client_id=${integrationOption.clientId}&response_type=code&scope=write-protected&state=${state}`;
          break;
        case 'vercel':
          link = `https://vercel.com/integrations/${integrationOption.clientSlug}/new?state=${state}`;
          break;
        case 'netlify':
          link = `https://app.netlify.com/authorize?client_id=${integrationOption.clientId}&response_type=code&state=${state}&redirect_uri=${window.location.origin}/integrations/netlify/oauth2/callback`;
          break;
        case 'github':
          link = `https://github.com/login/oauth/authorize?client_id=${integrationOption.clientId}&response_type=code&scope=repo&redirect_uri=${window.location.origin}/integrations/github/oauth2/callback&state=${state}`;
          break;
        case 'gitlab':
          link = `https://gitlab.com/oauth/authorize?client_id=${integrationOption.clientId}&redirect_uri=${window.location.origin}/integrations/gitlab/oauth2/callback&response_type=code&state=${state}`;
          break;
        case 'render':
          link = `${window.location.origin}/integrations/render/authorize`;
          break;
        case 'flyio':
          link = `${window.location.origin}/integrations/flyio/authorize`;
          break;
        case 'circleci':
          link = `${window.location.origin}/integrations/circleci/authorize`;
          break;
        case 'travisci':
          link = `${window.location.origin}/integrations/travisci/authorize`;
          break;
        case 'supabase':
          link = `${window.location.origin}/integrations/supabase/authorize`;
          break;
        case 'checkly':
          link = `${window.location.origin}/integrations/checkly/authorize`;
          break;
        case 'railway':
          link = `${window.location.origin}/integrations/railway/authorize`;
          break;
        case 'hashicorp-vault':
          link = `${window.location.origin}/integrations/hashicorp-vault/authorize`;
          break;
        case 'cloudflare-pages':
          link = `${window.location.origin}/integrations/cloudflare-pages/authorize`;
          break;
        default:
          break;
      }

      if (link !== '') {
        window.location.assign(link);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuthorizedIntegrationOptionPress = (integrationAuth: IntegrationAuth) => {
    try {
      let link = '';
      switch (integrationAuth.integration) {
        case 'azure-key-vault':
          link = `${window.location.origin}/integrations/azure-key-vault/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'aws-parameter-store':
          link = `${window.location.origin}/integrations/aws-parameter-store/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'aws-secret-manager':
          link = `${window.location.origin}/integrations/aws-secret-manager/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'heroku':
          link = `${window.location.origin}/integrations/heroku/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'vercel':
          link = `${window.location.origin}/integrations/vercel/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'netlify':
          link = `${window.location.origin}/integrations/netlify/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'github':
          link = `${window.location.origin}/integrations/github/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'gitlab':
          link = `${window.location.origin}/integrations/gitlab/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'render':
          link = `${window.location.origin}/integrations/render/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'flyio':
          link = `${window.location.origin}/integrations/flyio/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'circleci':
          link = `${window.location.origin}/integrations/circleci/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'travisci':
          link = `${window.location.origin}/integrations/travisci/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'supabase':
          link = `${window.location.origin}/integrations/supabase/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'checkly':
          link = `${window.location.origin}/integrations/checkly/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'railway':
          link = `${window.location.origin}/integrations/railway/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'hashicorp-vault':
          link = `${window.location.origin}/integrations/hashicorp-vault/create?integrationAuthId=${integrationAuth._id}`;
          break;
        case 'cloudflare-pages':
          link = `${window.location.origin}/integrations/cloudflare-pages/create?integrationAutHId=${integrationAuth._id}`;
        default:
          break;
      }

      if (link !== '') {
        window.location.assign(link);
      }
    } catch (err) {
      console.error(err);
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
      const integrationAuthX = integrationAuths.find(
        (integrationAuth) => integrationAuth.integration === integrationOption.slug
      );

      if (!bot.isActive) {
        await handleBotActivate();
      }

      if (!integrationAuthX) {
        // case: integration has not been authorized
        handleUnauthorizedIntegrationOptionPress(integrationOption);
        return;
      }

      handleAuthorizedIntegrationOptionPress(integrationAuthX);
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Handle deleting integration authorization [integrationAuth] and corresponding integrations from state where applicable
   * @param {Object} obj
   * @param {IntegrationAuth} obj.integrationAuth - integrationAuth to delete
   */
  const handleDeleteIntegrationAuth = async ({
    integrationAuth: deletedIntegrationAuth
  }: {
    integrationAuth: IntegrationAuth;
  }) => {
    try {
      const newIntegrations = integrations.filter(
        (integration) => integration.integrationAuth !== deletedIntegrationAuth._id
      );
      setIntegrationAuths(
        integrationAuths.filter(
          (integrationAuth) => integrationAuth._id !== deletedIntegrationAuth._id
        )
      );
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
  };

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
  };

  return (
    <div className="flex max-h-full flex-col justify-between bg-bunker-800 text-white">
      <Head>
        <title>{t('common.head-title', { title: t('integrations.title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t('integrations.description') as string} />
      </Head>
      <div className="no-scrollbar::-webkit-scrollbar h-screen max-h-[calc(100vh-10px)] w-full overflow-y-scroll pb-6 no-scrollbar">
        <NavHeader pageName={t('integrations.title')} isProjectRelated />
        <ActivateBotDialog
          isOpen={isActivateBotDialogOpen}
          closeModal={() => setIsActivateBotDialogOpen(false)}
          selectedIntegrationOption={selectedIntegrationOption}
          integrationOptionPress={integrationOptionPress}
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
              integrationOptionPress(integrationOption);
            }}
            integrationAuths={integrationAuths}
            handleDeleteIntegrationAuth={handleDeleteIntegrationAuth}
          />
        ) : (
          <>
            <div className="m-4 mt-7 flex max-w-5xl flex-col items-start justify-between px-2 text-xl">
              <h1 className="text-3xl font-semibold">{t('integrations.cloud-integrations')}</h1>
              <p className="text-base text-gray-400">{t('integrations.click-to-start')}</p>
            </div>
            <div className="mx-6 grid max-w-5xl grid-cols-4 grid-rows-2 gap-4">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(elem => <div key={elem} className="bg-mineshaft-800 border border-mineshaft-600 animate-pulse h-32 rounded-md"/>)}
            </div>
          </>
        )}
        <FrameworkIntegrationSection frameworks={frameworkIntegrationOptions as any} />
      </div>
    </div>
  );
}

Integrations.requireAuth = true;
