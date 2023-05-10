import { useTranslation } from 'react-i18next';

import FrameworkIntegration from './FrameworkIntegration';

interface Framework {
  name: string;
  image: string;
  link: string;
  slug: string;
  docsLink: string;
}

interface Props {
  frameworks: [Framework];
}

const FrameworkIntegrationSection = ({ frameworks }: Props) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="mx-4 mt-12 mb-4 flex max-w-5xl flex-col items-start justify-between px-2 text-xl">
        <h1 className="text-3xl font-semibold">{t('integrations.framework-integrations')}</h1>
        <p className="text-base text-gray-400">{t('integrations.click-to-setup')}</p>
      </div>
      <div className="mx-6 mt-4 grid max-w-5xl grid-cols-7 grid-rows-2 gap-4">
        {frameworks.map((framework) => (
          <FrameworkIntegration
            framework={framework}
            key={`framework-integration-${framework.slug}`}
          />
        ))}
      </div>
    </>
  );
};

export default FrameworkIntegrationSection;
