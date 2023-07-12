import { useEffect } from "react";
import { useRouter } from "next/router";

import {
  boot as bootIntercom,
  load as loadIntercom,
  update as updateIntercom,
} from "./intercom";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const IntercomProvider = ({ children }: { children: any }) => {
  const router = useRouter();

  if (typeof window !== "undefined") {
    console.log("window is defined");
    loadIntercom();
    bootIntercom();
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleRouteChange = (url: string) => {
      if (typeof window !== "undefined") {
        updateIntercom();
      }
    };

    router.events.on("routeChangeStart", handleRouteChange);

    // If the component is unmounted, unsubscribe
    // from the event with the `off` method:
    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router.events]);

  return children;
};