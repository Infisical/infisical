import { useTranslation } from "react-i18next";
import { faKeyboard } from "@fortawesome/free-regular-svg-icons";
import { faComputer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  frameworks: Array<{
    name: string;
    image: string;
    slug: string;
    docsLink: string;
  }>;
};

export const FrameworkIntegrationSection = ({ frameworks }: Props) => {
  const { t } = useTranslation();

  const sortedFrameworks = frameworks.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="mx-4 mt-12 mb-4 flex flex-col items-start justify-between px-2 text-xl">
        <h1 className="text-3xl font-semibold">{t("integrations.framework-integrations")}</h1>
        <p className="text-base text-gray-400">{t("integrations.click-to-setup")}</p>
      </div>
      <div className="mx-6 mt-4 grid grid-cols-3 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
        {sortedFrameworks.map((framework) => (
          <a
            key={`framework-integration-${framework.slug}`}
            href={framework.docsLink}
            rel="noopener noreferrer"
            target="_blank"
            className="relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 duration-200 hover:bg-mineshaft-700"
          >
            {framework?.image && (
              <img
                src={`/images/integrations/${framework.image}.png`}
                height={60}
                width={60}
                className="mt-auto"
                alt="integration logo"
              />
            )}
            {framework?.name && (
              <div className="mt-auto max-w-xs text-center text-sm font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
                {framework.name}
              </div>
            )}
          </a>
        ))}
        <a
          key="framework-integration-more"
          href="https://infisical.com/docs/cli/commands/run"
          rel="noopener noreferrer"
          target="_blank"
          className="relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 duration-200 hover:bg-mineshaft-700"
        >
          <FontAwesomeIcon className="mt-auto text-5xl text-white/90" icon={faKeyboard} />
          <div className="mt-auto max-w-xs text-center text-sm font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
            CLI
          </div>
        </a>
        <a
          key="framework-integration-more"
          href="https://infisical.com/docs/sdks/overview"
          rel="noopener noreferrer"
          target="_blank"
          className="relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4 duration-200 hover:bg-mineshaft-700"
        >
          <FontAwesomeIcon className="mt-auto text-5xl text-white/90" icon={faComputer} />
          <div className="mt-auto max-w-xs text-center text-sm font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
            SDKs
          </div>
        </a>
      </div>
    </>
  );
};
