import crypto from "crypto";

import { useState } from "react";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useGetCloudIntegrations } from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function GitLabAuthorizeIntegrationPage() {
    const { data: cloudIntegrations } = useGetCloudIntegrations();
  
    const [gitLabURL, setGitLabURL] = useState("");
  
    const handleIntegrateWithOAuth = () => {
        if (!cloudIntegrations) return;
        const integrationOption = cloudIntegrations.find((integration) => integration.slug === "gitlab");
        
        if (!integrationOption) return;
        
        const baseURL = gitLabURL.trim() === "" ? "https://gitlab.com" : gitLabURL.trim();
        
        const csrfToken = crypto.randomBytes(16).toString("hex");
        localStorage.setItem("latestCSRFToken", csrfToken);
        
        const link = `${baseURL}/oauth/authorize?client_id=${integrationOption.clientId}&redirect_uri=${window.location.origin}/integrations/gitlab/oauth2/callback&response_type=code&state=${state}`;
        window.location.assign(link);
    }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">GitLab Integration</CardTitle>
        <FormControl label="Self-hosted URL (optional)">
            <Input 
                placeholder="https://self-hosted-gitlab.com" 
                value={gitLabURL} onChange={(e) => setGitLabURL(e.target.value)} 
            />
          </FormControl>
        <Button
            onClick={handleIntegrateWithOAuth}
            leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-2" />}
            className="h-11 w-full mx-0 mt-4"
        > 
            Continue with OAuth
        </Button>
      </Card>
    </div>
  );
}

GitLabAuthorizeIntegrationPage.requireAuth = true;
