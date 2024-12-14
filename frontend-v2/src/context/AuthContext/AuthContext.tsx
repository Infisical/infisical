import { ReactNode } from "react";

import { useGetAuthToken } from "@app/hooks/api";

type Props = {
  children: ReactNode;
};

// TODO(akhilmhdh): Using react-simple-animate from hard dom offloading
// smoother dom offloading needs to be done

// Authentication controller
// Does route checking
// Provide a context for whole app to notify user is authorized or not
export const AuthProvider = ({ children }: Props): JSX.Element => {
  const { isLoading } = useGetAuthToken();

  // wait for app to load the auth state
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      </div>
    );
  }

  return children as JSX.Element;
};
