import { useState } from "react";
import { useRouter } from "next/router";

import { useSaveIntegrationAccessToken } from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function AWSSecretManagerCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [isLoading, setIsLoading] = useState(false);

  const [accessKey, setAccessKey] = useState("");
  const [accessKeyErrorText, setAccessKeyErrorText] = useState("");
  const [accessSecretKey, setAccessSecretKey] = useState("");
  const [accessSecretKeyErrorText, setAccessSecretKeyErrorText] = useState("");

  const handleButtonClick = async () => {
    try {
      setAccessKeyErrorText("");
      setAccessSecretKeyErrorText("");

      if (accessKey.length === 0) {
        setAccessKeyErrorText("Access key cannot be blank");
        return;
      }

      if (accessSecretKey.length === 0) {
        setAccessSecretKeyErrorText("Secret access key cannot be blank");
        return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: localStorage.getItem("projectData.id"),
        integration: "aws-secret-manager",
        accessId: accessKey,
        accessToken: accessSecretKey,
        url: null,
        namespace: null
      });

      setAccessKey("");
      setAccessSecretKey("");
      setIsLoading(false);

      router.push(
        `/integrations/aws-secret-manager/create?integrationAuthId=${integrationAuth._id}`
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="mb-4 text-center">AWS Secret Manager Integration</CardTitle>
        <FormControl
          label="Access Key ID"
          errorText={accessKeyErrorText}
          isError={accessKeyErrorText !== "" ?? false}
        >
          <Input placeholder="" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
        </FormControl>
        <FormControl
          label="Secret Access Key"
          errorText={accessSecretKeyErrorText}
          isError={accessSecretKeyErrorText !== "" ?? false}
        >
          <Input
            placeholder=""
            value={accessSecretKey}
            onChange={(e) => setAccessSecretKey(e.target.value)}
          />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to AWS Secret Manager
        </Button>
      </Card>
    </div>
  );
}

AWSSecretManagerCreateIntegrationPage.requireAuth = true;
