import { AlertTriangle, Copy } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, DocumentationLinkBadge } from "@app/components/v3";
import { PamAccountType } from "@app/hooks/api/pam";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { PamDocsUrls } from "@app/pages/pam/pam-docs-urls";

const SSH_CERTIFICATE_AUTH_METHOD = "certificate";

const buildInstallCommand = (accountId: string) =>
  `curl -sSf -H "Authorization: Bearer ${getAuthToken()}" "${window.location.origin}/api/v1/pam/accounts/${accountId}/ssh-ca-setup" | sudo bash`;

type Props = {
  accountType?: string;
  authMethod?: string;
  accountId?: string; // present only for an existing account
};

export const SshCaSetupCallout = ({ accountType, authMethod, accountId }: Props) => {
  if (accountType !== PamAccountType.SSH || authMethod !== SSH_CERTIFICATE_AUTH_METHOD) {
    return null;
  }

  const handleCopy = () => {
    if (!accountId) return;
    navigator.clipboard.writeText(buildInstallCommand(accountId));
    createNotification({ type: "success", text: "Install command copied to clipboard" });
  };

  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-warning">SSH CA setup required</p>
            <DocumentationLinkBadge href={PamDocsUrls.guides.sshCertificateAuth} />
          </div>
          <p className="mt-1 text-muted">
            Certificate authentication requires the target host to trust Infisical&apos;s SSH
            certificate authority. Copy the install command and run it on the host as root,
            otherwise certificate-based sessions will fail.
          </p>

          {accountId ? (
            <Button type="button" variant="warning" size="xs" className="mt-3" onClick={handleCopy}>
              <Copy />
              Copy install command
            </Button>
          ) : (
            <p className="mt-2 text-muted">
              After creating this account, open it and use{" "}
              <span className="font-medium text-foreground">Copy install command</span> to get the
              command for the target host.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
