import { CodeBlock, TabsContent } from "@app/components/v3";

import { getKmipServerSiteUrl, KMIP_START_SERVICE_COMMAND } from "./commands";

export const AwsStartCommandContent = ({ kmipServerId, kmipServerName }: Props) => {
  const siteURL = getKmipServerSiteUrl();
  const enrollArgs = `--enroll-method=aws --kmip-server-id=${kmipServerId} --domain=${siteURL}`;
  const cliCommand = `infisical kmip start ${kmipServerName} ${enrollArgs}`;
  const systemdInstallCommand = `sudo infisical kmip systemd install ${kmipServerName} ${enrollArgs}`;

  return (
    <div className="min-w-0 space-y-4">
      <TabsContent value="cli" className="min-w-0">
        <CodeBlock value={cliCommand} label="Command" />
      </TabsContent>
      <TabsContent value="systemd" className="min-w-0 space-y-4">
        <CodeBlock value={systemdInstallCommand} label="Install service" />
        <CodeBlock value={KMIP_START_SERVICE_COMMAND} label="Start service" />
      </TabsContent>
      <p className="text-xs text-muted">
        The host needs AWS credentials whose principal matches the allowlist. The certificate config
        (hostnames or IPs, TTL, key algorithm) is read from this server&apos;s settings.
      </p>
    </div>
  );
};

type Props = {
  kmipServerId: string;
  kmipServerName: string;
};
