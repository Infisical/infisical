import { useState } from "react";
import { useRouter } from "next/router";

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

      router.push(`/integrations/hashicorp-vault/create?integrationAuthId=${integrationAuth._id}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Vault Integration</CardTitle>
        <FormControl
          label="Vault Cluster URL"
          errorText={vaultURLErrorText}
          isError={vaultURLErrorText !== "" ?? false}
        >
          <Input placeholder="" value={vaultURL} onChange={(e) => setVaultURL(e.target.value)} />
        </FormControl>
        <FormControl
          label="Vault Namespace"
          errorText={vaultNamespaceErrorText}
          isError={vaultNamespaceErrorText !== "" ?? false}
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
        >
          <Input placeholder="" value={vaultRoleID} onChange={(e) => setVaultRoleID(e.target.value)} />
        </FormControl>
        <FormControl
          label="Vault SecretID"
          errorText={vaultSecretIDErrorText}
          isError={vaultSecretIDErrorText !== "" ?? false}
        >
          <Input 
                placeholder="" 
                value={vaultSecretID} 
                onChange={(e) => setVaultSecretID(e.target.value)} 
            />
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
        >
          Connect to Vault
        </Button>
      </Card>
    </div>
  );
}

HashiCorpVaultAuthorizeIntegrationPage.requireAuth = true;