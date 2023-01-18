import { useEffect } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import AuthorizeIntegration from './api/integrations/authorizeIntegration';

export default function Vercel() {
  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split('?')[1]);
  const {code} = parsedUrl;
  const {state} = parsedUrl;

  /**
   * Here we forward to the default workspace if a user opens this url
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      try {
        // type check
        if (!code) throw new Error('Code not found');

        if (state === localStorage.getItem('latestCSRFToken')) {
          localStorage.removeItem('latestCSRFToken');

          await AuthorizeIntegration({
            workspaceId: localStorage.getItem('projectData.id') as string,
            code: code as string,
            integration: 'vercel',
          });

          router.push(
            `/integrations/${  localStorage.getItem('projectData.id')}`
          );
        }
      } catch (err) {
        console.error('Vercel integration error: ', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div />;
}

Vercel.requireAuth = true;
