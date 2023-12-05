import { useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  useSaveIntegrationAccessToken
} from "@app/hooks/api";

import { Button, Card, CardTitle, FormControl, Input } from "../../../components/v2";

export default function HashiCorpVaultAuthorizeIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [vaultURL, setVaultURL] = useState("");
  const [vaultURLErrorText, setVaultURLErrorText] = useState("");
  
  const [vaultNamespace, setVaultNamespace] = useState("");
  const [vaultNamespaceErrorText, setVaultNamespaceErrorText] = useState("");

  const [vaultRoleID, setVaultRoleID] = useState("");
  const [vaultRoleIDErrorText, setVaultRoleIDErrorText] = useState("");

  const [vaultSecretID, setVaultSecretID] = useState("");
  const [vaultSecretIDErrorText, setVaultSecretIDErrorText] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const handleButtonClick = async () => {
    try {
      if (vaultURL.length === 0) {
        setVaultURLErrorText("Vault Cluster URL cannot be blank");
      } else {
        setVaultURLErrorText(""); 
      }
      
      if (vaultNamespace.length === 0) {
        setVaultNamespaceErrorText("Vault Namespace cannot be blank");
      } else {
        setVaultNamespaceErrorText("");
      }
      
      if (vaultRoleID.length === 0) {
        setVaultRoleIDErrorText("Vault Role ID cannot be blank");
      } else {
        setVaultRoleIDErrorText("");
      }
        
      if (vaultSecretID.length === 0) {
        setVaultSecretIDErrorText("Vault Secret ID cannot be blank");
      } else {
        setVaultSecretIDErrorText("");
      }
      if (
          vaultURL.length === 0 ||
          vaultNamespace.length === 0 ||
          vaultRoleID.length === 0 ||
          vaultSecretID.length === 0
      ) {
          return;
      }

      setIsLoading(true);

      const integrationAuth = await mutateAsync({
          workspaceId: localStorage.getItem("projectData.id"),
          integration: "hashicorp-vault",
          accessId: vaultRoleID,
          accessToken: vaultSecretID,
          url: vaultURL,
          namespace: vaultNamespace
      });

      setIsLoading(false);

      router.push(`/integrations/hashicorp-vault/create?integrationAuthId=${integrationAuth.id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Authorize Vault Integration</title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <Card className="max-w-lg rounded-md border border-mineshaft-600 mb-12">
        <CardTitle 
          className="text-left px-6 text-xl" 
          subTitle="After connecting to Vault, you will be prompted to set up an integration for a particular Infisical project and environment."
        >
          <div className="flex flex-row items-center">
            <div className="inline flex items-center">
              <Image
                src="/images/integrations/Vault.png"
                height={30}
                width={30}
                alt="HCP Vault logo"
              />
            </div>
            <span className="ml-2.5">HashiCorp Vault Integration</span>
            <Link href="https://infisical.com/docs/integrations/cloud/hashicorp-vault" passHref>
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
          label="Vault Cluster URL"
          errorText={vaultURLErrorText}
          isError={vaultURLErrorText !== "" ?? false}
          className="px-6"
        >
          <Input placeholder="" value={vaultURL} onChange={(e) => setVaultURL(e.target.value)} />
        </FormControl>
        <FormControl
          label="Vault Namespace"
          errorText={vaultNamespaceErrorText}
          isError={vaultNamespaceErrorText !== "" ?? false}
          className="px-6"
        >
          <Input 
                placeholder="admin/education" 
                value={vaultNamespace} 
                onChange={(e) => setVaultNamespace(e.target.value)} 
            />
        </FormControl>
        <FormControl
          label="Vault RoleID"
          errorText={vaultRoleIDErrorText}
          isError={vaultRoleIDErrorText !== "" ?? false}
          className="px-6"
        >
          <Input placeholder="" value={vaultRoleID} onChange={(e) => setVaultRoleID(e.target.value)} />
        </FormControl>
        <FormControl
          label="Vault SecretID"
          errorText={vaultSecretIDErrorText}
          isError={vaultSecretIDErrorText !== "" ?? false}
          className="px-6"
        >
          <Input 
                placeholder="" 
                value={vaultSecretID} 
                onChange={(e) => setVaultSecretID(e.target.value)} 
            />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          colorSchema="primary"
          variant="outline_bg"
          className="mb-6 mt-2 ml-auto mr-6 w-min"
          isLoading={isLoading}
        >
          Connect to Vault
        </Button>
      </Card>
    </div>
  );
}

HashiCorpVaultAuthorizeIntegrationPage.requireAuth = true;