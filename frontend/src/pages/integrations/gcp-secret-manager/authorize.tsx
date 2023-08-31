import { useState } from "react";
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";

import {
  useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input, TextArea } from "../../../components/v2";

export default function GCPSecretManagerAuthorizeIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();
  
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenErrorText, setAccessTokenErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      setAccessTokenErrorText("");
      if (accessToken.length === 0) {
        setAccessTokenErrorText("Access token cannot be blank");
        return;
      }
      
      console.log("setAccessTokenErrorText");
      console.log("accessToken: ", accessToken);

    //   setIsLoading(true);

    //   const integrationAuth = await mutateAsync({
    //     workspaceId: localStorage.getItem("projectData.id"),
    //     integration: "flyio",
    //     accessId: null,
    //     accessToken,
    //     url: null,
    //     namespace: null
    //   });

    //   setIsLoading(false);

    //   router.push(`/integrations/flyio/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">GCP Secret Manager Integration</CardTitle>
        <Button
            colorSchema="primary" 
            variant="outline_bg"
            onClick={() => {
                // TODO: somehow get client ID
                // link = `https://accounts.google.com/o/oauth2/auth?scope=https://www.googleapis.com/auth/cloud-platform&response_type=code&access_type=offline&state=${state}&redirect_uri=${window.location.origin}/integrations/gcp-secret-manager/oauth2/callback&client_id=${integrationOption.clientId}`;
            }} 
            leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-2" />}
            className="h-11 w-full mx-0 mt-4"
        > 
            Continue with OAuth
        </Button>
        <div className='w-full flex flex-row items-center my-4 py-2'>
            <div className='w-full border-t border-mineshaft-400/60' /> 
            <span className="mx-2 text-mineshaft-200 text-xs">or</span>
            <div className='w-full border-t border-mineshaft-400/60' />
        </div>
        <FormControl
          label="GCP Service Account JSON"
          errorText={accessTokenErrorText}
          isError={accessTokenErrorText !== "" ?? false}
        >
        <TextArea 
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder=""
        />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to GCP Secret Manager
        </Button>
        
      </Card>
    </div>
  );
}

GCPSecretManagerAuthorizeIntegrationPage.requireAuth = true;
