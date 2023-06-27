import { useEffect } from "react";
import { useRouter } from "next/router";

import { useUser } from "@app/context";

import {
  boot as bootIntercom,
  load as loadIntercom,
  update as updateIntercom,
} from "./intercom";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const IntercomProvider = ({ children }: { children: any }) => {
  const { user } = useUser();
  const router = useRouter();

  if (typeof window !== "undefined") {
    loadIntercom();
    bootIntercom({name: `${user?.firstName || ""} ${user?.lastName || ""}`, email: user?.email || "", created_at: Math.floor(((new Date(user?.createdAt))?.getTime() || 0) / 1000)});
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