import { useTranslation } from 'next-i18next';

import CloudIntegration from './CloudIntegration';

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

interface IntegrationAuth {
  _id: string;
  integration: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  cloudIntegrationOptions: IntegrationOption[];
  setSelectedIntegrationOption: () => void;
  integrationOptionPress: (integrationOption: IntegrationOption) => void;
  integrationAuths: IntegrationAuth[];
  handleDeleteIntegrationAuth: (args: { integrationAuth: IntegrationAuth }) => void;
}

const CloudIntegrationSection = ({
  cloudIntegrationOptions,
  setSelectedIntegrationOption,
  integrationOptionPress,
  integrationAuths,
  handleDeleteIntegrationAuth
}: Props) => {
  const { t } = useTranslation();

  return (
    <>
      <div
        className="flex flex-col justify-between items-start m-4 mt-7 text-xl max-w-5xl px-2"
      >
        <h1 className='font-semibold text-3xl'>
          {t('integrations:cloud-integrations')}
        </h1>
        <p className='text-base text-gray-400'>
          {t('integrations:click-to-start')}
        </p>
      </div>
      <div className='grid gap-4 grid-cols-4 grid-rows-2 mx-6 max-w-5xl'>
        {cloudIntegrationOptions.map((cloudIntegrationOption) => (
          <CloudIntegration
            cloudIntegrationOption={cloudIntegrationOption}
            setSelectedIntegrationOption={setSelectedIntegrationOption}
            integrationOptionPress={integrationOptionPress}
            integrationAuths={integrationAuths}
            handleDeleteIntegrationAuth={handleDeleteIntegrationAuth}
            key={`cloud-integration-${cloudIntegrationOption.slug}`}
          />
        ))}
      </div>
    </>
  );
};

export default CloudIntegrationSection;
