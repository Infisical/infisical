import { ReactNode, useEffect } from "react";
import { useRouter } from "next/router";

import { publicPaths } from "@app/const";
import { useToggle } from "@app/hooks";
import { useGetAuthToken } from "@app/hooks/api";
import { isLoggedIn } from "@app/reactQuery";

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
  const { pathname, push, asPath } = useRouter();
  const [isReady, setIsReady] = useToggle(false);

  useEffect(() => {
    // check if loading of auth is done
    if (!isLoading) {
      // not a public path and not authenticated kick to login page
      if (!publicPaths.includes(pathname) && !isLoggedIn()) {
        push({ pathname: "/login", query: { redirect: asPath } }).then(() => {
          setIsReady.on();
        });
      } else {
        // else good to go
        setIsReady.on();
      }
    }
  }, [pathname, isLoading]);

  // wait for app to load the auth state
  if (isLoading || !isReady) {
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
