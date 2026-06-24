import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  IconButton,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import {
  TKmipServerAuthMethodView,
  TKmipServerWithAuthMethod
} from "@app/hooks/api/kmipServers/types";

import { KmipServerAuthMethodModal } from "../KmipServerAuthMethod/KmipServerAuthMethodModal";
import { KmipServerCertConfigModal } from "../KmipServerCertConfig/KmipServerCertConfigModal";

const AuthMethodBadge = ({ method }: { method: TKmipServerAuthMethodView["method"] }) => {
  if (method === "aws") return <Badge variant="info">AWS Auth</Badge>;
  if (method === "token") return <Badge variant="info">Token Auth</Badge>;
  return <Badge variant="warning">Machine Identity</Badge>;
};

export const KmipServerDetailsCard = ({
  kmipServer
}: {
  kmipServer: TKmipServerWithAuthMethod;
}) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [certConfigModalOpen, setCertConfigModalOpen] = useState(false);
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { authMethod } = kmipServer;
  const isIdentityServer = authMethod.method === "identity";

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <DetailGroupHeader>General</DetailGroupHeader>
            <Detail>
              <DetailLabel>ID</DetailLabel>
              <DetailValue className="flex items-center gap-x-1">
                <span className="font-mono text-xs">{kmipServer.id}</span>
                <IconButton
                  aria-label="copy kmip server id"
                  onClick={() => {
                    navigator.clipboard.writeText(kmipServer.id);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </IconButton>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{kmipServer.name}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>{format(new Date(kmipServer.createdAt), "PPpp")}</DetailValue>
            </Detail>
          </DetailGroup>
          {!isIdentityServer && (
            <>
              <Separator className="my-4" />
              <DetailGroup>
                <DetailGroupHeader className="flex items-center justify-between">
                  Certificate Configuration
                  <OrgPermissionCan
                    I={OrgKmipServerPermissionActions.EditKmipServers}
                    a={OrgPermissionSubjects.KmipServer}
                  >
                    {(isAllowed) => (
                      <IconButton
                        size="xs"
                        variant="ghost-muted"
                        aria-label="edit certificate configuration"
                        isDisabled={!isAllowed}
                        onClick={() => setCertConfigModalOpen(true)}
                      >
                        <PencilIcon />
                      </IconButton>
                    )}
                  </OrgPermissionCan>
                </DetailGroupHeader>
                <Detail>
                  <DetailLabel>Hostnames / IPs</DetailLabel>
                  <DetailValue>
                    {kmipServer.hostnamesOrIps || <span className="text-muted">&mdash;</span>}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Certificate TTL</DetailLabel>
                  <DetailValue>{kmipServer.ttl || "1y"}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Key Algorithm</DetailLabel>
                  <DetailValue>
                    {certKeyAlgorithmToNameMap[
                      (kmipServer.keyAlgorithm as CertKeyAlgorithm) || CertKeyAlgorithm.RSA_2048
                    ] ?? kmipServer.keyAlgorithm}
                  </DetailValue>
                </Detail>
              </DetailGroup>
            </>
          )}
          <Separator className="my-4" />
          <DetailGroup>
            <DetailGroupHeader className="flex items-center justify-between">
              Authentication
              {!isIdentityServer && (
                <OrgPermissionCan
                  I={OrgKmipServerPermissionActions.EditKmipServers}
                  a={OrgPermissionSubjects.KmipServer}
                >
                  {(isAllowed) => (
                    <IconButton
                      size="xs"
                      variant="ghost-muted"
                      aria-label="edit auth method"
                      isDisabled={!isAllowed}
                      onClick={() => setAuthModalOpen(true)}
                    >
                      <PencilIcon />
                    </IconButton>
                  )}
                </OrgPermissionCan>
              )}
            </DetailGroupHeader>
            {isIdentityServer && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertTitle>Authenticated via Machine Identity (Legacy)</AlertTitle>
                <AlertDescription>
                  <p>
                    This KMIP server is still using machine identity. We recommend creating a new
                    KMIP server.
                  </p>
                  <Link
                    to="/organizations/$orgId/projects/kms/kmip-servers"
                    params={{ orgId }}
                    className="underline underline-offset-4"
                  >
                    Create a new KMIP server
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            {!isIdentityServer && (
              <Detail>
                <DetailLabel>Method</DetailLabel>
                <DetailValue>
                  <AuthMethodBadge method={authMethod.method} />
                </DetailValue>
              </Detail>
            )}
            {authMethod.method === "aws" && (
              <>
                <Detail>
                  <DetailLabel>STS Endpoint</DetailLabel>
                  <DetailValue>{authMethod.config.stsEndpoint}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Allowed Principal ARNs</DetailLabel>
                  <DetailValue>
                    {authMethod.config.allowedPrincipalArns || (
                      <span className="text-muted">&mdash;</span>
                    )}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Allowed Account IDs</DetailLabel>
                  <DetailValue>
                    {authMethod.config.allowedAccountIds || (
                      <span className="text-muted">&mdash;</span>
                    )}
                  </DetailValue>
                </Detail>
              </>
            )}
            {authMethod.method === "identity" && authMethod.config.identityName && (
              <Detail>
                <DetailLabel>Machine Identity</DetailLabel>
                <DetailValue>{authMethod.config.identityName}</DetailValue>
              </Detail>
            )}
          </DetailGroup>
        </CardContent>
      </Card>

      {!isIdentityServer && (
        <>
          <KmipServerAuthMethodModal
            isOpen={authModalOpen}
            onOpenChange={setAuthModalOpen}
            kmipServerId={kmipServer.id}
            currentMethod={authMethod}
          />
          <KmipServerCertConfigModal
            isOpen={certConfigModalOpen}
            onOpenChange={setCertConfigModalOpen}
            kmipServer={kmipServer}
          />
        </>
      )}
    </>
  );
};
