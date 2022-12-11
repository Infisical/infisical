import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import { publicPaths } from '~/const';
import checkAuth from '~/pages/api/auth/CheckAuth';

// #TODO: finish spinner only when the data loads fully
// #TODO: Redirect somewhere if the page does not exist

export default function RouteGuard({ children }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // on initial load - run auth check
    (async () => {
      await authCheck(router.asPath);
    })();

    // on route change start - hide page content by setting authorized to false
    // #TODO: add the loading page when not yet authorized.
    const hideContent = () => setAuthorized(false);
    // const onError = () => setAuthorized(true)
    router.events.on('routeChangeStart', hideContent);
    // router.events.on("routeChangeError", onError);

    // on route change complete - run auth check
    router.events.on('routeChangeComplete', authCheck);

    // unsubscribe from events in useEffect return function
    return () => {
      router.events.off('routeChangeStart', hideContent);
      router.events.off('routeChangeComplete', authCheck);
      // router.events.off("routeChangeError", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * redirect to login page if accessing a private page and not logged in
   * @param {*} url - the url of the page we are trying to go to
   */
  async function authCheck(url) {
    // Make sure that we don't redirect when the user is on the following pages.
    const path = '/' + url.split('?')[0].split('/')[1];

    // Check if the user is authenticated
    const response = await checkAuth();
    // #TODO: figure our why sometimes it doesn't output a response
    if (!publicPaths.includes(path)) {
      try {
        if (response.status !== 200) {
          router.push('/login');
          console.log('Unauthorized to access.');
          setAuthorized(false);
        } else {
          setAuthorized(true);
          console.log('Authorized to access.');
        }
      } catch (error) {
        console.log(
          'Error (probably the authCheck route is stuck again...):',
          error
        );
      }
    }
  }

  if (authorized) {
    return children;
  } else {
    return (
      <div className="w-screen h-screen bg-bunker-800 flex items-center justify-center">
        <Image
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="google logo"
        ></Image>
      </div>
    );
  }
}
