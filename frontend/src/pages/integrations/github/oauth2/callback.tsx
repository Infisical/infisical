import { useEffect } from 'react';
import { useRouter } from 'next/router';
import queryString from 'query-string';

import { getTranslatedServerSideProps } from '../../../../components/utilities/withTranslateProps';
import AuthorizeIntegration from "../../../api/integrations/authorizeIntegration";

export default function GitHubOAuth2CallbackPage() {
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
                    integration: 'github'
                });

                router.push(
                    `/integrations/github/create?integrationAuthId=${integrationAuth._id}`
                );

            } catch (err) {
                console.error(err);
            }
        })();
    }, []);
    
    return <div />
}

GitHubOAuth2CallbackPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);