import { Helmet } from "react-helmet";
import { Link, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeftIcon, FileSignatureIcon, HardDriveIcon, UserIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CopyButton,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  Empty,
  EmptyDescription,
  EmptyTitle,
  PageLoader
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  getSigningOperationStatusBadgeVariant,
  SigningActorType,
  signingAlgorithmLabels,
  signingOperationStatusLabels,
  useGetSigningOperation
} from "@app/hooks/api/signers";

const ROUTE_ID =
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/$signerId/operations/$operationId" as const;

const MonoValue = ({ value }: { value: string }) => (
  <DetailValue className="flex items-center gap-2 font-mono text-xs break-all">
    {value}
    <CopyButton value={value} ariaLabel="Copy value" />
  </DetailValue>
);

export const SigningOperationDetailPage = () => {
  const { signerId, operationId } = useParams({ from: ROUTE_ID });
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data, isPending } = useGetSigningOperation(signerId, operationId);

  if (isPending) return <PageLoader />;

  if (!data) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col px-6 py-6">
        <Empty className="border border-solid">
          <EmptyTitle>Signing operation not found</EmptyTitle>
          <EmptyDescription>
            The operation may belong to a different signer, or you may not have access to it.
          </EmptyDescription>
        </Empty>
      </div>
    );
  }

  const { operation, signerName } = data;
  const metadata = operation.clientMetadata;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-y-4 px-6 py-6">
      <Helmet>
        <title>Signing Operation | {signerName}</title>
      </Helmet>

      <Link
        to="/organizations/$orgId/projects/cert-manager/$projectId/code-signing/$signerId"
        params={{ orgId: currentOrg.id, projectId: currentProject.id, signerId }}
        search={{ selectedTab: "activity" }}
        className="flex w-fit items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        Back to {signerName}
      </Link>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-mineshaft-800 text-muted">
          <FileSignatureIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Signing Operation</h1>
            <Badge variant={getSigningOperationStatusBadgeVariant(operation.status)}>
              {signingOperationStatusLabels[operation.status] ?? operation.status}
            </Badge>
          </div>
          <p className="text-sm text-muted">
            {format(new Date(operation.createdAt), "MMM d, yyyy 'at' HH:mm:ss")} · {signerName}
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <DetailGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail>
                <DetailLabel>Algorithm</DetailLabel>
                <DetailValue>
                  {signingAlgorithmLabels[operation.signingAlgorithm] ?? operation.signingAlgorithm}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Actor</DetailLabel>
                <DetailValue className="flex items-center gap-1.5">
                  {operation.actorType === SigningActorType.User ? (
                    <UserIcon className="size-3.5 text-muted" />
                  ) : (
                    <HardDriveIcon className="size-3.5 text-muted" />
                  )}
                  {operation.actorName ?? operation.actorId}
                </DetailValue>
              </Detail>
            </div>
            <Detail>
              <DetailLabel>Data Digest (SHA-256)</DetailLabel>
              <MonoValue value={operation.dataHash} />
            </Detail>
            {operation.errorMessage && (
              <Detail>
                <DetailLabel>Error</DetailLabel>
                <DetailValue className="text-danger">{operation.errorMessage}</DetailValue>
              </Detail>
            )}

            {metadata && Object.values(metadata).some(Boolean) && (
              <>
                <DetailGroupHeader className="mt-2 border-t border-border pt-4">
                  Client Context
                </DetailGroupHeader>
                {metadata.command && (
                  <Detail>
                    <DetailLabel>Command</DetailLabel>
                    <MonoValue value={metadata.command} />
                  </Detail>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {metadata.tool && (
                    <Detail>
                      <DetailLabel>Signing Application</DetailLabel>
                      <DetailValue>{metadata.tool}</DetailValue>
                    </Detail>
                  )}
                  {metadata.hostname && (
                    <Detail>
                      <DetailLabel>Hostname</DetailLabel>
                      <DetailValue>{metadata.hostname}</DetailValue>
                    </Detail>
                  )}
                  {metadata.osUsername && (
                    <Detail>
                      <DetailLabel>OS Username</DetailLabel>
                      <DetailValue>{metadata.osUsername}</DetailValue>
                    </Detail>
                  )}
                  {metadata.sourceIp && (
                    <Detail>
                      <DetailLabel>IP Address</DetailLabel>
                      <DetailValue>{metadata.sourceIp}</DetailValue>
                    </Detail>
                  )}
                  {metadata.reportedIp && (
                    <Detail>
                      <DetailLabel>Reported IP</DetailLabel>
                      <DetailValue>{metadata.reportedIp}</DetailValue>
                    </Detail>
                  )}
                </div>
                {metadata.signingApplicationHash && (
                  <Detail>
                    <DetailLabel>Signing Application Checksum</DetailLabel>
                    <MonoValue value={metadata.signingApplicationHash} />
                  </Detail>
                )}
              </>
            )}
          </DetailGroup>
        </CardContent>
      </Card>
    </div>
  );
};
