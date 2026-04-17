import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, ExternalLinkIcon, PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton
} from "@app/components/v3";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import { useTimedReset } from "@app/hooks";
import {
  getSignerStatusBadgeVariant,
  signerStatusLabels,
  TSigner,
  useGetSignerPublicKey
} from "@app/hooks/api/signers";

type Props = {
  signer: TSigner;
  projectId: string;
  onEdit?: () => void;
};

const ALGORITHM_LABELS: Record<string, string> = {
  rsa: "RSA",
  "rsa-pss": "RSA-PSS",
  ec: "ECDSA",
  ed25519: "Ed25519",
  ed448: "Ed448"
};

export const SignerOverviewSection = ({ signer, projectId, onEdit }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: publicKeyData } = useGetSignerPublicKey(signer.id);
  // eslint-disable-next-line @typescript-eslint/naming-convention,@typescript-eslint/no-unused-vars
  const [_, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const algorithmLabel = publicKeyData?.algorithm
    ? (ALGORITHM_LABELS[publicKeyData.algorithm] ?? publicKeyData.algorithm)
    : "—";

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Signer Details</CardTitle>
          <CardDescription>Signer configuration and key details</CardDescription>
          {onEdit && (
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionCodeSigningActions.Edit}
                a={ProjectPermissionSub.CodeSigners}
              >
                {(isAllowed) => (
                  <IconButton isDisabled={!isAllowed} onClick={onEdit} size="xs" variant="outline">
                    <PencilIcon />
                  </IconButton>
                )}
              </ProjectPermissionCan>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>{signer.name}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>ID</DetailLabel>
              <DetailValue className="flex items-center gap-x-1">
                {signer.id}
                <Tooltip content="Copy signer ID to clipboard">
                  <IconButton
                    onClick={() => {
                      navigator.clipboard.writeText(signer.id);
                      setCopyTextId("Copied");
                    }}
                    variant="ghost"
                    size="xs"
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </Tooltip>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                  {signerStatusLabels[signer.status] ?? signer.status}
                </Badge>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Key Algorithm</DetailLabel>
              <DetailValue className="font-mono">{algorithmLabel}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Approval Policy</DetailLabel>
              <DetailValue>
                {signer.approvalPolicyId && signer.approvalPolicyName ? (
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/code-signing"
                    params={{
                      orgId: currentOrg.id,
                      projectId
                    }}
                    search={{ tab: "approvals", subtab: "policies" }}
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    {signer.approvalPolicyName}
                    <ExternalLinkIcon className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>{format(new Date(signer.createdAt), "MMM d, yyyy HH:mm")}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Last Signed</DetailLabel>
              <DetailValue>
                {signer.lastSignedAt ? (
                  format(new Date(signer.lastSignedAt), "MMM d, yyyy HH:mm")
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Certificate</CardTitle>
          <CardDescription>
            <div className="flex items-center gap-2">
              <div>Linked signing certificate</div>
              <Button variant="ghost" size="xs" asChild>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId"
                  params={{
                    orgId: currentOrg.id,
                    projectId,
                    certificateId: signer.certificateId
                  }}
                >
                  View
                  <ExternalLinkIcon className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Common Name</DetailLabel>
              <DetailValue>
                {signer.certificateCommonName || <span className="text-muted">—</span>}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Serial Number</DetailLabel>
              <DetailValue className="font-mono text-xs">
                {signer.certificateSerialNumber?.toUpperCase() || (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Expires</DetailLabel>
              <DetailValue>
                {signer.certificateNotAfter ? (
                  format(new Date(signer.certificateNotAfter), "MMM d, yyyy")
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </CardContent>
      </Card>
    </div>
  );
};
