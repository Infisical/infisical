import integrations from "../json/infrastructureIntegrations.json";

export const InfrastructureIntegrationTab = () => {
  const sortedIntegrations = integrations.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="mb-4 flex flex-col items-start justify-between px-2 text-xl">
        <p className="text-base text-gray-400">
          Click on an integration to read the documentation.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {sortedIntegrations.map((integration) => (
          <a
            key={`framework-integration-${integration.slug}`}
            href={integration.docsLink}
            rel="noopener noreferrer"
            target="_blank"
            className="relative flex h-32 w-full cursor-pointer flex-row items-center justify-center rounded-md p-0.5 duration-200"
          >
            <div
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              className="group relative flex h-32 w-full cursor-pointer flex-row items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 duration-200 hover:bg-mineshaft-700"
              key={integration?.name}
            >
              <img
                src={`/images/integrations/${integration.image}.png`}
                height={integration?.name ? 60 : 90}
                width={integration?.name ? 60 : 90}
                alt="integration logo"
              />
              <div className="ml-4 max-w-xs text-xl font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
                {integration?.name && integration.name}
              </div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
};
