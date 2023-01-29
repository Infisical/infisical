/* eslint-disable react/jsx-props-no-spreading */
import { useEffect } from 'react';
import { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { appWithTranslation } from 'next-i18next';
import { config } from '@fortawesome/fontawesome-svg-core';
import { QueryClientProvider } from '@tanstack/react-query';

import Layout from '@app/components/basic/Layout';
import NotificationProvider from '@app/components/context/Notifications/NotificationProvider';
import Telemetry from '@app/components/utilities/telemetry/Telemetry';
import { publicPaths } from '@app/const';
import { AuthProvider } from '@app/context/AuthContext';
import { queryClient } from '@app/reactQuery';

import '@fortawesome/fontawesome-svg-core/styles.css';
import '../styles/globals.css';

config.autoAddCss = false;

type NextAppProp = AppProps & {
  Component: AppProps['Component'] & { requireAuth: boolean };
};

const App = ({ Component, pageProps, ...appProps }: NextAppProp): JSX.Element => {
  const router = useRouter();

  useEffect(() => {
    const storedLang = localStorage.getItem('lang');
    if (router.locale ?? storedLang !== 'en' ?? 'en') {
      router.push(router.asPath, router.asPath, {
        locale: storedLang ?? 'en'
      });
    }
  }, [router.locale, router.pathname]);

  useEffect(() => {
    // Init for auto capturing
    const telemetry = new Telemetry().getInstance();

    const handleRouteChange = () => {
      if (typeof window !== 'undefined') {
        telemetry.capture('$pageview');
      }
    };

    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events]);

  // If it's one of these routes, don't add the layout (e.g., these routes are external)
  if (
    publicPaths.includes(`/${appProps.router.pathname.split('/')[1]}`) ||
    !Component.requireAuth
  ) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </NotificationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default appWithTranslation(App);

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
