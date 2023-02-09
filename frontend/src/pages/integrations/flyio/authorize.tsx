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

export default function FlyioCreateIntegrationPage() {
    const router = useRouter();
    const [accessToken, setAccessToken] = useState('');
    const [accessTokenErrorText, setAccessTokenErrorText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
        
    const handleButtonClick = async () => {
        try {
            setAccessTokenErrorText('');
            if (accessToken.length === 0) {
                setAccessTokenErrorText('Access token cannot be blank');
                return;
            }

            setIsLoading(true);

            const integrationAuth = await saveIntegrationAccessToken({
                workspaceId: localStorage.getItem('projectData.id'),
                integration: 'flyio',
                accessToken
            });

            setIsLoading(false);
            
            router.push(
                `/integrations/flyio/create?integrationAuthId=${integrationAuth._id}`
            );
        } catch (err) {
            console.error(err);
        }
    }
    
    return (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center'>Fly.io Integration</CardTitle>
         <FormControl
          label="Fly.io Access Token"
          errorText={accessTokenErrorText}
          isError={accessTokenErrorText !== '' ?? false}
        >
          <Input
            placeholder=''
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
          />
        </FormControl>
        <Button 
            onClick={handleButtonClick}
            color="mineshaft" 
            className='mt-4'
            isLoading={isLoading}
        >
            Connect to Fly.io
        </Button>
      </Card>
    </div>
  )
}

FlyioCreateIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);