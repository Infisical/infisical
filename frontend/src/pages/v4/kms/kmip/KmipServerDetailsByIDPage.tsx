import { type ReactNode, useEffect, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";

import {
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TKmipServerWithAuthMethod } from "@app/hooks/api/kmipServers/types";

import { BackButton, CopyButton } from "../../access/org/detail-parts";
import { useOrgId, useOrgPermission } from "../../access/permissions";
import { formatDateTime } from "../../access/roles";
import { failed, toast } from "../../access/toast";
import { AccessRestricted, Gate, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { KmipEnrollment } from "../../data/kmip/contract";
import { useGo } from "../../links";
import { ConnectClientsCard, DeployCard } from "./deploy-card";
import {
  AuthMethodDialog,
  CertConfigDialog,
  DeleteKmipServerDialog,
  RevokeKmipServerDialog
} from "./server-dialogs";
import { errorStatus, KMIP_SERVER_DOCS, keyAlgorithmName, kmipLinks } from "./shared";

import css from "./kmip.module.css";

const Dash = () => <span className={css.muted}>-</span>;

const methodLabel = { aws: "AWS auth", token: "Token auth", identity: "Machine identity" };

const EditButton = ({
  label,
  allowed,
  onClick
}: {
  label: string;
  allowed: boolean;
  onClick: () => void;
}) => (
  <Gate allowed={allowed}>
    <Button
      variant="outline"
      size="icon-xs"
      aria-label={label}
      disabled={!allowed}
      onClick={onClick}
    >
      <Icon icon={PencilIcon} size={12} />
    </Button>
  </Gate>
);

const useEnrollment = (server: TKmipServerWithAuthMethod | undefined) => {
  const generate = useV4Adapter("kmip").useGenerateEnrollmentToken();
  const [enrollment, setEnrollment] = useState<KmipEnrollment | null>(null);
  const [minting, setMinting] = useState(false);
  const revision = useRef(0);
  const clear = () => {
    revision.current += 1;
    setEnrollment(null);
  };
  useEffect(clear, [server?.id, server?.authMethod.method]);
  const mint = async () => {
    if (!server) return;
    const started = revision.current;
    setMinting(true);
    try {
      const result = await generate.mutateAsync({ kmipServerId: server.id });
      if (revision.current === started) setEnrollment(result);
    } catch (error) {
      failed("Failed to generate deploy command", error);
    } finally {
      setMinting(false);
    }
  };
  return { enrollment, minting, mint, clear };
};

export const KmipServerDetailsByIDPage = () => {
  const { kmipServerId } = useParams({
    from: "/v4/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId"
  });
  const orgId = useOrgId();
  const go = useGo();
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: server, isPending, error } = useV4Adapter("kmip").useServer(kmipServerId);
  const { enrollment, minting, mint, clear } = useEnrollment(server);
  const [dialog, setDialog] = useState<"auth" | "cert" | "revoke" | "delete">();
  const can = (action: OrgKmipServerPermissionActions) =>
    permission.can(action, OrgPermissionSubjects.KmipServer);
  const back = () => go(kmipLinks.servers(orgId));

  if (permissionPending || (isPending && !error))
    return <Loader size="page" label="Loading KMIP server" />;
  if (!can(OrgKmipServerPermissionActions.ListKmipServers))
    return <AccessRestricted requirement="list KMIP servers" />;
  if (!server) {
    const missing = !error || [400, 404].includes(errorStatus(error) ?? 0);
    return (
      <EmptyState
        icon={missing ? "machine" : "alert-c"}
        title={missing ? "KMIP server not found" : "Couldn't load KMIP server"}
        description={
          missing
            ? "It may have been deleted. Return to the list to pick another KMIP server."
            : (error as Error | undefined)?.message
        }
        actions={
          <Button variant="outline" onClick={back}>
            Back to KMIP servers
          </Button>
        }
      />
    );
  }

  const canEdit = can(OrgKmipServerPermissionActions.EditKmipServers);
  const canRevoke = can(OrgKmipServerPermissionActions.RevokeKmipServerAccess);
  const canDelete = can(OrgKmipServerPermissionActions.DeleteKmipServers);
  const { authMethod } = server;
  const isIdentity = authMethod.method === "identity";

  const authItems: [string, ReactNode][] = [];
  if (!isIdentity)
    authItems.push([
      "Method",
      <Badge key="method" tone="soft">
        {methodLabel[authMethod.method]}
      </Badge>
    ]);
  if (authMethod.method === "aws")
    authItems.push(
      ["Allowed principal ARNs", authMethod.config.allowedPrincipalArns || <Dash key="arns" />],
      ["Allowed account IDs", authMethod.config.allowedAccountIds || <Dash key="accounts" />]
    );
  if (authMethod.method === "identity" && authMethod.config.identityName)
    authItems.push(["Machine identity", authMethod.config.identityName]);

  return (
    <TooltipProvider>
      <div className={css.detailPage}>
        <Stack gap={24}>
          <Stack gap={8}>
            <BackButton label="KMIP servers" onClick={back} />
            <PageHeader
              title={server.name}
              badges={<DocumentationLink href={KMIP_SERVER_DOCS} subject="KMIP servers" />}
              actions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" iconRight="more">
                      Options
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        navigator.clipboard?.writeText(server.id);
                        toast({ tone: "neutral", title: "KMIP server ID copied to clipboard" });
                      }}
                    >
                      <Icon name="copy" />
                      Copy KMIP server ID
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {server.canRevoke && (
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!canRevoke}
                        description={canRevoke ? undefined : RESTRICTED}
                        onSelect={() => setDialog("revoke")}
                      >
                        <Icon name="lock" />
                        Revoke access
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!canDelete}
                      description={canDelete ? undefined : RESTRICTED}
                      onSelect={() => setDialog("delete")}
                    >
                      <Icon name="trash" />
                      Delete KMIP server
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          </Stack>
          <DetailLayout
            asideLabel="Details"
            aside={
              <Stack gap={24}>
                <Card variant="framed" title="Details">
                  <DataList
                    variant="props"
                    density="compact"
                    items={[
                      [
                        "ID",
                        <Inline key="id" gap={4} align="center" wrap={false}>
                          <MiddleTruncate mono keepEnd={6} text={server.id} />
                          <CopyButton value={server.id} label="Copy KMIP server ID" />
                        </Inline>
                      ],
                      ["Name", server.name],
                      ["Created", formatDateTime(server.createdAt)]
                    ]}
                  />
                </Card>
                {!isIdentity && (
                  <Card
                    variant="framed"
                    title="Certificate configuration"
                    action={
                      <EditButton
                        label="Edit certificate configuration"
                        allowed={canEdit}
                        onClick={() => setDialog("cert")}
                      />
                    }
                  >
                    <DataList
                      variant="props"
                      density="compact"
                      items={[
                        ["Hostnames or IPs", server.hostnamesOrIps || <Dash key="hosts" />],
                        ["Certificate TTL", server.ttl || "1y"],
                        ["Key algorithm", keyAlgorithmName(server.keyAlgorithm)]
                      ]}
                    />
                  </Card>
                )}
                <Card
                  variant="framed"
                  title="Authentication"
                  action={
                    isIdentity ? undefined : (
                      <EditButton
                        label="Edit auth method"
                        allowed={canEdit}
                        onClick={() => setDialog("auth")}
                      />
                    )
                  }
                >
                  <Stack gap={12}>
                    {isIdentity && (
                      <Alert
                        tone="warn"
                        title="Authenticated through a machine identity (legacy)"
                        actions={
                          <Button variant="link" onClick={back}>
                            Create a new KMIP server
                          </Button>
                        }
                      >
                        This server still uses a machine identity. Create a new KMIP server to
                        replace it.
                      </Alert>
                    )}
                    {authItems.length > 0 && (
                      <DataList variant="props" density="compact" items={authItems} />
                    )}
                  </Stack>
                </Card>
              </Stack>
            }
          >
            <div className={css.column}>
              <DeployCard
                server={server}
                canEdit={canEdit}
                enrollment={enrollment}
                minting={minting}
                onGenerate={mint}
              />
              <ConnectClientsCard />
            </div>
          </DetailLayout>
        </Stack>
      </div>
      {dialog === "auth" && (
        <AuthMethodDialog server={server} onClose={() => setDialog(undefined)} onChanged={clear} />
      )}
      {dialog === "cert" && (
        <CertConfigDialog server={server} onClose={() => setDialog(undefined)} />
      )}
      {dialog === "revoke" && (
        <RevokeKmipServerDialog
          server={server}
          onClose={() => setDialog(undefined)}
          onRevoked={clear}
        />
      )}
      {dialog === "delete" && (
        <DeleteKmipServerDialog
          server={server}
          detail
          onClose={() => setDialog(undefined)}
          onDeleted={back}
        />
      )}
    </TooltipProvider>
  );
};
