import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
                if (accessKey.length === 0) setAccessKeyErrorText("API Token cannot be blank!");
                if (accountId.length === 0) setAccountIdErrorText("Account ID cannot be blank!");
                return;
            }

            setIsLoading(true);

            const integrationAuth = await mutateAsync({
                workspaceId: localStorage.getItem("projectData.id"),
                integration: "cloudflare-pages",
                accessId: accountId,
                accessToken: accessKey
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
            <Head>
                <title>Authorize Cloudflare Pages Integration</title>
                <link rel='icon' href='/infisical.ico' />
            </Head>
            <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
                <CardTitle className="text-left px-6" subTitle="After adding the details below, you will be prompted to set up an integration for a particular Infisical project and environment.">
                    <div className="flex flex-row items-center">
                        <div className="inline flex items-center pb-0.5">
                            <Image
                            src="/images/integrations/Cloudflare.png"
                            height={30}
                            width={30}
                            alt="Cloudflare Pages logo"
                            />
                        </div>
                    <span className="ml-1.5">Cloudflare Pages Integration</span>
                    <Link href="https://infisical.com/docs/integrations/cloud/cloudflare-pages" passHref>
                        <a target="_blank" rel="noopener noreferrer">
                        <div className="ml-2 mb-1 rounded-md text-yellow text-sm inline-block bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] opacity-80 hover:opacity-100 cursor-default">
                            <FontAwesomeIcon icon={faBookOpen} className="mr-1.5"/> 
                            Docs
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1.5 text-xxs mb-[0.07rem]"/> 
                        </div>
                    </a>
                    </Link>
                    </div>
                </CardTitle>
                <FormControl
                    label="Cloudflare Pages API Token"
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