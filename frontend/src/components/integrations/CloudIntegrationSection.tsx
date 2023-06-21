import { useTranslation } from "react-i18next";

import CloudIntegration from "./CloudIntegration";

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
      <div className="m-4 mt-7 flex max-w-5xl flex-col items-start justify-between px-2 text-xl">
        <h1 className="text-3xl font-semibold">{t("integrations.cloud-integrations")}</h1>
        <p className="text-base text-gray-400">{t("integrations.click-to-start")}</p>
      </div>
      <div className="mx-6 grid max-w-5xl grid-cols-4 grid-rows-2 gap-4">
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
