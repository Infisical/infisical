import { createContext, ReactNode, useContext, useEffect, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

import { ContentLoader } from "@app/components/v2/ContentLoader";
import { useGetServerConfig } from "@app/hooks/api";
import { TServerConfig } from "@app/hooks/api/admin/types";

type TServerConfigContext = {
  config: TServerConfig;
};

const ServerConfigContext = createContext<TServerConfigContext | null>(null);

type Props = {
  children: ReactNode;
};

export const ServerConfigProvider = ({ children }: Props): JSX.Element => {
  const router = useRouter();
  const { data, isLoading } = useGetServerConfig();

  // memorize the workspace details for the context
  const value = useMemo<TServerConfigContext>(() => {
    return {
      config: data!
    };
  }, [data]);

  useEffect(() => {
    if (!isLoading && data && !data.initialized && !data.isMigrationModeOn) {
      router.push("/admin/signup");
    }
  }, [isLoading, data]);

  if (!isLoading && data?.isMigrationModeOn) {
    return (
      <div className="relative mx-auto flex h-screen w-full flex-col items-center justify-center space-y-8 bg-bunker-800 px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <Head>
          <title>Infisical Maintenance Mode</title>
          <link rel="icon" href="/infisical.ico" />
        </Head>
        <img
          src="/images/maintenance.png"
          height={175}
          width={300}
          alt="maintenance mode"
          className="w-[40rem]"
        />
        <p className="mx-8 mb-4 flex justify-center bg-gradient-to-tr from-mineshaft-300 to-white bg-clip-text text-4xl font-bold text-transparent md:mx-16">
          Scheduled Maintenance
        </p>
        <div className="mt-2 text-center text-lg text-bunker-300">
          Infisical is undergoing planned maintenance. <br /> No action is required on your end —
          your applications will continue to fetch secrets.
          <br /> If you have questions, please{" "}
          <a
            className="text-bunker-300 underline decoration-primary-800 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
            href="https://infisical.com/slack"
            target="_blank"
            rel="noopener noreferrer"
          >
            join our Slack community
          </a>
          .
        </div>
      </div>
    );
  }

  if (isLoading || (!data?.initialized && router.pathname !== "/admin/signup")) {
    return (
      <div className="bg-bunker-800">
        <ContentLoader text="Loading configurations" />
      </div>
    );
  }

  return <ServerConfigContext.Provider value={value}>{children}</ServerConfigContext.Provider>;
};

export const useServerConfig = () => {
  const ctx = useContext(ServerConfigContext);
  if (!ctx) {
    throw new Error("useServerConfig has to be used within <UserContext.Provider>");
  }

  return ctx;
};
