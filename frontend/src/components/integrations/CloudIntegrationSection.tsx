import { useTranslation } from 'next-i18next';

import CloudIntegration from './CloudIntegration';

interface CloudIntegrationOption {
  isAvailable: boolean;
  name: string;
  type: string;
  clientId: string;
  docsLink: string;
  slug: string;
}

interface Props {
  cloudIntegrationOptions: CloudIntegrationOption[];
  setSelectedIntegrationOption: () => void;
  integrationOptionPress: () => void;
  integrationAuths: any;
}

const CloudIntegrationSection = ({
  cloudIntegrationOptions,
  setSelectedIntegrationOption,
  integrationOptionPress,
  integrationAuths,
}: Props) => {
  const { t } = useTranslation();

  return (
    <>
      <div
        className={`flex flex-col justify-between items-start m-4 mt-7 text-xl max-w-5xl px-2`}
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
            key={`cloud-integration-${cloudIntegrationOption.slug}`}
          />
        ))}
      </div>
    </>
  );
};

export default CloudIntegrationSection;
