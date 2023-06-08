import IntegrationTile from './Integration';

interface Props {
  integrations: any;
  setIntegrations: any;
  bot: any;
  setBot: any;
  environments: Array<{ name: string; slug: string }>;
  handleDeleteIntegration: (args: { integration: Integration }) => void;
}

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

const ProjectIntegrationSection = ({
  integrations,
  setIntegrations,
  bot,
  setBot,
  environments = [],
  handleDeleteIntegration
}: Props) => {
  return integrations.length > 0 ? (
    <div className="mb-12">
      <div className="mx-4 mb-4 mt-6 flex max-w-5xl flex-col items-start justify-between px-2 text-xl">
        <h1 className="text-3xl font-semibold">Current Integrations</h1>
        <p className="text-base text-bunker-300">Manage integrations with third-party services.</p>
      </div>
      {integrations.map((integration: Integration) => {
        return (
          <IntegrationTile
            key={`integration-${integration?._id.toString()}`}
            integration={integration}
            integrations={integrations}
            bot={bot}
            setBot={setBot}
            setIntegrations={setIntegrations}
            environments={environments}
            handleDeleteIntegration={handleDeleteIntegration}
          />
        );
      })}
    </div>
  ) : (
    <div />
  );
};

export default ProjectIntegrationSection;
