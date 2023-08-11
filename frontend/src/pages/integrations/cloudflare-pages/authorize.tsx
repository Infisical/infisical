import { useState } from "react";
import { useRouter } from "next/router";

import {
    useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button,Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function CloudflarePagesIntegrationPage() {
    const router = useRouter();
    const { mutateAsync } = useSaveIntegrationAccessToken();

    const [accessKey, setAccessKey] = useState("");
    const [accessKeyErrorText, setAccessKeyErrorText] = useState("");
    const [accountId, setAccountId] = useState("");
    const [accountIdErrorText, setAccountIdErrorText] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleButtonClick = async () => {
        try {
            setAccessKeyErrorText("");
            setAccountIdErrorText("");
            if (accessKey.length === 0 || accountId.length === 0) {
                if (accessKey.length === 0) setAccessKeyErrorText("API token cannot be blank!");
                if (accountId.length === 0) setAccountIdErrorText("Account ID cannot be blank!");
                return;
            }

            setIsLoading(true);

            const integrationAuth = await mutateAsync({
                workspaceId: localStorage.getItem("projectData.id"),
                integration: "cloudflare-pages",
                accessId: accountId,
                accessToken: accessKey,
                url: null,
                namespace: null
            });

            setAccessKey("");
            setAccountId("");
            setIsLoading(false);

            router.push(`/integrations/cloudflare-pages/create?integrationAuthId=${integrationAuth._id}`);
        } catch (err) {
            console.error(err);
        }
    }

    return (
        <div className="flex h-full w-full items-center justify-center">
            <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
                <CardTitle className="text-left px-6" subTitle="After adding your API-key, you will be prompted to set up an integration for a particular Infisical project and environment.">Cloudflare Pages Integration</CardTitle>
                <FormControl
                    label="Cloudflare Pages API token"
                    errorText={accessKeyErrorText}
                    isError={accessKeyErrorText !== "" ?? false}
                    className="mx-6"
                >
                    <Input
                        placeholder=""
                        value={accessKey}
                        onChange={(e) => setAccessKey(e.target.value)}
                    />
                </FormControl>
                <FormControl
                    label="Cloudflare Pages Account ID"
                    errorText={accountIdErrorText}
                    isError={accountIdErrorText !== "" ?? false}
                    className="mx-6"
                >
                    <Input
                        placeholder=""
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                    />
                </FormControl>
                <Button
                    onClick={handleButtonClick}
                    color="mineshaft"
                    variant="outline_bg"
                    className="mb-6 mt-2 ml-auto mr-6 w-min"
                    isFullWidth={false}
                    isLoading={isLoading}
                >
                    Connect to Cloudflare Pages
                </Button>
            </Card>
        </div>
    );
}

CloudflarePagesIntegrationPage.requireAuth = true;