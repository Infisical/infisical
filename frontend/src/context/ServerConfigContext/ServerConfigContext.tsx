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
    if (!isLoading && data && !data.initialized) {
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

  return <ServerConfigContext.Provider value={value}>{children}</ServerConfigContext.Provider>;
};

export const useServerConfig = () => {
  const ctx = useContext(ServerConfigContext);
  if (!ctx) {
    throw new Error("useServerConfig has to be used within <UserContext.Provider>");
  }

  return ctx;
};
