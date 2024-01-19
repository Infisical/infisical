import { createContext, ReactNode, useContext, useEffect, useMemo } from "react";
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

  if (isLoading || (!data?.initialized && router.pathname !== "/admin/signup")) {
    return (
      <div className="bg-bunker-800">
        <ContentLoader text="Loading configurations" />
      </div>
    );
  }

  if (data?.isMigrationModeOn) {
    return (
      <div className="relative mx-auto flex h-screen w-full flex-col items-center justify-center space-y-8 bg-bunker-800 px-8 text-mineshaft-50 dark:[color-scheme:dark]">
        <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
        <div className="mt-4 text-center text-xl">
          Infisical under migration. See you in some time. <br /> All read operations are allowed
        </div>
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
