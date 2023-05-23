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

export default function AWSSecretManagerCreateIntegrationPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    
    const [accessKey, setAccessKey] = useState('');
    const [accessKeyErrorText, setAccessKeyErrorText] = useState('');
    const [accessSecretKey, setAccessSecretKey] = useState('');
    const [accessSecretKeyErrorText, setAccessSecretKeyErrorText] = useState('');
        
    const handleButtonClick = async () => {
        try {
            setAccessKeyErrorText('');
            setAccessSecretKeyErrorText('');

            if (accessKey.length === 0) {
                setAccessKeyErrorText('Access key cannot be blank');
                return;
            }

            if (accessSecretKey.length === 0) {
                setAccessSecretKeyErrorText('Secret access key cannot be blank');
                return;
            }

            setIsLoading(true);
            
            const integrationAuth = await saveIntegrationAccessToken({
                workspaceId: localStorage.getItem('projectData.id'),
                integration: 'aws-secret-manager',
                accessId: accessKey,
                accessToken: accessSecretKey
            });
            
            setAccessKey('');
            setAccessSecretKey('');
            setIsLoading(false);
            
            router.push(
                `/integrations/aws-secret-manager/create?integrationAuthId=${integrationAuth._id}`
            );
        } catch (err) {
            console.error(err);
        }
    }
    
    return (
    <div className="h-full w-full flex justify-center items-center">
      <Card className="max-w-md p-8 rounded-md">
        <CardTitle className='text-center mb-4'>AWS Secret Manager Integration</CardTitle>
         <FormControl
          label="Access Key ID"
          errorText={accessKeyErrorText}
          isError={accessKeyErrorText !== '' ?? false}
        >
          <Input
            placeholder=''
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
          />
        </FormControl>
        <FormControl
          label="Secret Access Key"
          errorText={accessSecretKeyErrorText}
          isError={accessSecretKeyErrorText !== '' ?? false}
        >
          <Input
            placeholder=''
            value={accessSecretKey}
            onChange={(e) => setAccessSecretKey(e.target.value)}
          />
        </FormControl>
        <Button 
            onClick={handleButtonClick}
            color="mineshaft" 
            className='mt-4'
            isLoading={isLoading}
        >
            Connect to AWS Secret Manager
        </Button>
      </Card>
    </div>
  );
}

AWSSecretManagerCreateIntegrationPage.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['integrations']);