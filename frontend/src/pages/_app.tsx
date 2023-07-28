/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable func-names */
/* eslint-disable react/jsx-props-no-spreading */
// @ts-nocheck

import { useEffect } from "react";
import { AppProps } from "next/app";
import { useRouter } from "next/router";
import { config } from "@fortawesome/fontawesome-svg-core";
import { QueryClientProvider } from "@tanstack/react-query";
import NProgress from "nprogress";

import NotificationProvider from "@app/components/context/Notifications/NotificationProvider";
import { IntercomProvider } from "@app/components/utilities/intercom/intercomProvider";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { TooltipProvider } from "@app/components/v2";
import { publicPaths } from "@app/const";
import {
  AuthProvider,
  OrgProvider,
  SubscriptionProvider,
  UserProvider,
  WorkspaceProvider
} from "@app/context";
import { AppLayout } from "@app/layouts";
import { queryClient } from "@app/reactQuery";

import "nprogress/nprogress.css";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "../styles/globals.css";

import "@app/i18n";

config.autoAddCss = false;

type NextAppProp = AppProps & {
  Component: AppProps["Component"] & { requireAuth: boolean };
};

const App = ({ Component, pageProps, ...appProps }: NextAppProp): JSX.Element => {
  const router = useRouter();

  useEffect(() => {
    // Init for auto capturing
    const telemetry = new Telemetry().getInstance();

    const handleRouteChange = () => {
      // (window).Intercom('update');
      if (typeof window !== "undefined") {
        telemetry.capture("$pageview");
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  useEffect(() => {
    const handleStart = () => NProgress.start();

    const handleStop = () => NProgress.done();

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleStop);
    router.events.on("routeChangeError", handleStop);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleStop);
      router.events.off("routeChangeError", handleStop);
    };
  }, [router]);

  // If it's one of these routes, don't add the layout (e.g., these routes are external)
  if (
    publicPaths.includes(`/${appProps.router.pathname.split("/")[1]}`) ||
    !Component.requireAuth
  ) {
    return (
      <QueryClientProvider client={queryClient}>
        <NotificationProvider>
          <AuthProvider>
            <Component {...pageProps} />
          </AuthProvider>
        </NotificationProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <OrgProvider>
            <WorkspaceProvider>
              <SubscriptionProvider>
                <UserProvider>
                  <NotificationProvider>
                    <IntercomProvider>
                      <AppLayout>
                        <Component {...pageProps} />
                      </AppLayout>
                    </IntercomProvider>
                  </NotificationProvider>
                </UserProvider>
              </SubscriptionProvider>
            </WorkspaceProvider>
          </OrgProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

/* <Script
src="https://www.googletagmanager.com/gtag/js?id=G-DQ1XLJJGG1"
strategy="afterInteractive"
/>
<Script id="google-analytics" strategy="afterInteractive">
{`
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-DQ1XLJJGG1');
  `}
</Script> */
