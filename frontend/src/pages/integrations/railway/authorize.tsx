import { useState } from 'react';
import { useRouter } from 'next/router';

import { getTranslatedServerSideProps } from '../../../components/utilities/withTranslateProps';
import {
    Button, 
    Card, 
    CardTitle, 
    FormControl, 
    Input,
} from '../../../components/v2';
import saveIntegrationAccessToken from "../../api/integrations/saveIntegrationAccessToken";

export default function RailwayAuthorizeIntegrationPage() {
    const router = useRouter();
    const [apiKey, setApiKey] = useState('');
    const [apiKeyErrorText, setApiKeyErrorText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const handleButtonClick = async () => {
        try {
            setApiKeyErrorText('');
            if (apiKey.length === 0) {
                setApiKeyErrorText('API Key cannot be blank');
                return;
            }

            setIsLoading(true);

            const integrationAuth = await saveIntegrationAccessToken({
                workspaceId: localStorage.getItem('projectData.id'),
                integration: 'railway',
                accessId: null,
                accessToken: apiKey
            });

            setIsLoading(false);
            
            router.push(
                `/integrations/railway/create?integrationAuthId=${integrationAuth._id}`
            );
        } catch (err) {
            console.error(err);
        }
    }

    return (
        <div className="h-full w-full flex justify-center items-center">
            <Card className="max-w-md p-8 rounded-md">
                <CardTitle className='text-center'>Railway Integration</CardTitle>
                <FormControl
                    label="Railway API Key"
                    errorText={apiKeyErrorText}
                    isError={apiKeyErrorText !== '' ?? false}
                >
                <Input
                    placeholder=''
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                />
                </FormControl>
                <Button 
                    onClick={handleButtonClick}
                    color="mineshaft" 
                    className='mt-4'
                    isLoading={isLoading}
                >
                    Connect to Railway
                </Button>
            </Card>
        </div>
    );
}

RailwayAuthorizeIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);