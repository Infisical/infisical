import { useTranslation } from "react-i18next";

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
      <div
        className="mx-6 mt-4 grid grid-flow-dense gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}
      >
        {sortedFrameworks.map((framework) => (
          <a
            key={`framework-integration-${framework.slug}`}
            href={framework.docsLink}
            rel="noopener noreferrer"
            target="_blank"
            className="relative flex h-32 cursor-pointer flex-row items-center justify-center rounded-md p-0.5 duration-200"
          >
            <div
              className={`flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 font-semibold text-gray-300 duration-200 hover:bg-mineshaft-700 group-hover:text-gray-200 ${
                framework?.name?.split(" ").length > 1 ? "px-1 text-sm" : "px-2 text-xl"
              } w-full max-w-xs text-center`}
            >
              {framework?.image && (
                <img
                  src={`/images/integrations/${framework.image}.png`}
                  height={framework?.name ? 60 : 90}
                  width={framework?.name ? 60 : 90}
                  alt="integration logo"
                />
              )}
              {framework?.name && framework?.image && <div className="h-2" />}
              {framework?.name && framework.name}
            </div>
          </a>
        ))}
      </div>
    </>
  );
};
