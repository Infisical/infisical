/* eslint-disable vars-on-top */
/* eslint-disable no-var */
/* eslint-disable func-names */
/* eslint-disable react/jsx-props-no-spreading */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import { useEffect } from "react";
import { AppProps } from "next/app";
import { useRouter } from "next/router";
import { config } from "@fortawesome/fontawesome-svg-core";
import { QueryClientProvider } from "@tanstack/react-query";
import NProgress from "nprogress";

import { NotificationContainer } from "@app/components/notifications";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { TooltipProvider } from "@app/components/v2";
import { publicPaths } from "@app/const";
import {
  AuthProvider,
  OrgPermissionProvider,
  OrgProvider,
  ProjectPermissionProvider,
  ServerConfigProvider,
  SubscriptionProvider,
  UserProvider,
  WorkspaceProvider
} from "@app/context";
import { AppLayout } from "@app/layouts";
import ErrorBoundaryWrapper from "@app/layouts/AppLayout/ErrorBoundary";
import { queryClient } from "@app/reactQuery";

import "nprogress/nprogress.css";
import "react-toastify/dist/ReactToastify.css";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "react-day-picker/dist/style.css";
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
      <ErrorBoundaryWrapper>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <NotificationContainer />
            <ServerConfigProvider>
              <UserProvider>
                <AuthProvider>
                  <Component {...pageProps} />
                </AuthProvider>
              </UserProvider>
            </ServerConfigProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundaryWrapper>
    );
  }

  const Layout = Component?.layout || AppLayout;

  return (
    <ErrorBoundaryWrapper>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <NotificationContainer />
          <ServerConfigProvider>
            <AuthProvider>
              <OrgProvider>
                <OrgPermissionProvider>
                  <WorkspaceProvider>
                    <ProjectPermissionProvider>
                      <SubscriptionProvider>
                        <UserProvider>
                          <Layout>
                            <Component {...pageProps} />
                          </Layout>
                        </UserProvider>
                      </SubscriptionProvider>
                    </ProjectPermissionProvider>
                  </WorkspaceProvider>
                </OrgPermissionProvider>
              </OrgProvider>
            </AuthProvider>
          </ServerConfigProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundaryWrapper>
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
