import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Inline } from "@infisical/cipher/ui/layout";

import { PamAccountType } from "@app/hooks/api/pam";
import { getAuthToken } from "@app/hooks/api/reactQuery";

import { saved } from "../../access/toast";

const SSH_CA_DOCS =
  "https://infisical.com/docs/documentation/platform/pam/guides/ssh-certificate-auth";

export const SshCaNotice = ({
  accountType,
  authMethod,
  accountId
}: {
  accountType?: string;
  authMethod?: string;
  accountId?: string;
}) => {
  if (accountType !== PamAccountType.SSH || authMethod !== "certificate") return null;
  const copy = () => {
    if (!accountId) return;
    navigator.clipboard.writeText(
      `curl -sSf -H "Authorization: Bearer ${getAuthToken()}" "${window.location.origin}/api/v1/pam/accounts/${accountId}/ssh-ca-setup" | sudo bash`
    );
    saved("Install command copied to clipboard");
  };
  return (
    <Alert
      tone="warn"
      title={
        <Inline gap={8} align="center">
          SSH CA setup required
          <DocumentationLink href={SSH_CA_DOCS} subject="SSH certificate authentication" />
        </Inline>
      }
      actions={
        accountId ? (
          <Button variant="outline" size="sm" icon="copy" onClick={copy}>
            Copy install command
          </Button>
        ) : undefined
      }
    >
      {accountId
        ? "The target host must trust Infisical's SSH certificate authority. Run the install command on the host as root, or certificate sessions will fail."
        : "The target host must trust Infisical's SSH certificate authority. After creating this account, open it and copy the install command for the host."}
    </Alert>
  );
};
