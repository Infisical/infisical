import { useEffect } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import AuthorizeIntegration from './api/integrations/authorizeIntegration';

export default function Github() {
  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split('?')[1]);
  const code = parsedUrl.code;
  const state = parsedUrl.state;

  /**
   * Here we forward to the default workspace if a user opens this url
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      try {
        if (state === localStorage.getItem('latestCSRFToken')) {
          localStorage.removeItem('latestCSRFToken');
          await AuthorizeIntegration({
            workspaceId: localStorage.getItem('projectData.id') as string,
            code: code as string,
            integration: 'github',
          });
          router.push(
            '/integrations/' + localStorage.getItem('projectData.id')
          );
        }
      } catch (error) {
        console.error('Github integration error: ', error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div></div>;
}

Github.requireAuth = true;
