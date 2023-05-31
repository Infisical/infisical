import { useEffect } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import AuthorizeIntegration from '../../../api/integrations/authorizeIntegration';

export default function GitLabOAuth2CallbackPage() {
  const router = useRouter();
  const { code, state } = queryString.parse(router.asPath.split('?')[1]);
  useEffect(() => {
    (async () => {
      try {
        // validate state
        if (state !== localStorage.getItem('latestCSRFToken')) return;
        localStorage.removeItem('latestCSRFToken');

        const integrationAuth = await AuthorizeIntegration({
          workspaceId: localStorage.getItem('projectData.id') as string,
          code: code as string,
          integration: 'gitlab'
        });

        router.push(`/integrations/gitlab/create?integrationAuthId=${integrationAuth._id}`);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  return <div />;
}

GitLabOAuth2CallbackPage.requireAuth = true;
