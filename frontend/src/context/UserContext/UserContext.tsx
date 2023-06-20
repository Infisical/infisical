import { createContext, ReactNode, useContext, useMemo } from "react";

import { useGetUser } from "@app/hooks/api";
import { User } from "@app/hooks/api/types";

type TUserContext = {
  user: User;
  isLoading: boolean;
};

const UserContext = createContext<TUserContext | null>(null);

type Props = {
  children: ReactNode;
};

export const UserProvider = ({ children }: Props): JSX.Element => {
  const { data, isLoading } = useGetUser();

  // memorize the workspace details for the context
  const value = useMemo<TUserContext>(() => {
    return {
      user: data!,
      isLoading
    };
  }, [data, isLoading]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser has to be used within <UserContext.Provider>");
  }

  return ctx;
};
