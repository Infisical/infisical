import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  SigningActorType,
  signingAlgorithmLabels,
  type TSigningOperation
} from "@app/hooks/api/signers/types";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { dateTimeSeconds } from "../CodeSigningPage/signer-shared";
import { actorName, OperationStatusBadge } from "../SignerDetailPage/activity-tab";

const routeId = v4Path(
  "/organizations/$orgId/cert-manager/code-signing/$signerId/operations/$operationId"
);

type ClientMetadata = NonNullable<TSigningOperation["clientMetadata"]>;

const ClientContext = ({ metadata }: { metadata: ClientMetadata }) => {
  const items: DataListItem[] = [
    ...(metadata.tool ? ([["Signing application", metadata.tool]] as const) : []),
    ...(metadata.hostname ? ([["Hostname", metadata.hostname]] as const) : []),
    ...(metadata.osUsername ? ([["OS username", metadata.osUsername]] as const) : []),
    ...(metadata.sourceIp ? ([["IP address", metadata.sourceIp]] as const) : [])
  ];
  if (!items.length && !metadata.command && !metadata.signingApplicationHash) return null;
  return (
    <Card variant="framed" title="Client context">
      <Stack gap={16}>
        {metadata.command && (
          <Field label="Command" wide>
            <Snippet label="Command" copyLabel="Copy command" value={metadata.command} />
          </Field>
        )}
        {items.length > 0 && <DataList variant="props" items={items} />}
        {metadata.signingApplicationHash && (
          <Field label="Signing application checksum" wide>
            <Snippet
              label="Signing application checksum"
              copyLabel="Copy checksum"
              value={metadata.signingApplicationHash}
            />
          </Field>
        )}
      </Stack>
    </Card>
  );
};

const Page = () => {
  const go = useGo();
  const { orgId, signerId, operationId } = useParams({ from: routeId });
  const { data, isPending } = useV4Adapter("codeSigning").useSigningOperation(
    signerId,
    operationId
  );
  const signerHref = orgHref(orgId, `/cert-manager/code-signing/${signerId}?selectedTab=activity`);
  if (isPending) return <Loader size="page" label="Loading signing operation" />;
  if (!data)
    return (
      <EmptyState
        icon="file-key"
        title="Signing operation not found"
        description="It may belong to a different signer, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={signerHref}>Back to signer</a>
          </Button>
        }
      />
    );
  const { operation, signerName } = data;
  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[
          { label: "Signers", link: go.link(orgHref(orgId, "/cert-manager/code-signing")) },
          { label: signerName, link: go.link(signerHref) }
        ]}
        title="Signing operation"
        description={dateTimeSeconds(operation.createdAt)}
        badges={<OperationStatusBadge status={operation.status} />}
      />
      <Card variant="framed" title="Details">
        <Stack gap={16}>
          <DataList
            variant="props"
            items={[
              [
                "Algorithm",
                signingAlgorithmLabels[operation.signingAlgorithm] ?? operation.signingAlgorithm
              ],
              [
                "Actor",
                <Inline key="actor" gap={6}>
                  <Badge tone="outline">
                    {operation.actorType === SigningActorType.User ? "User" : "Machine identity"}
                  </Badge>
                  {actorName(operation)}
                </Inline>
              ],
              ...(operation.errorMessage ? ([["Error", operation.errorMessage]] as const) : [])
            ]}
          />
          <Field label="Data hash" wide>
            <Snippet label="Data hash" copyLabel="Copy data hash" value={operation.dataHash} />
          </Field>
        </Stack>
      </Card>
      {operation.clientMetadata && <ClientContext metadata={operation.clientMetadata} />}
    </Stack>
  );
};

export const SigningOperationDetailPage = () => {
  const { signerId, operationId } = useParams({ from: routeId });
  const { data } = useV4Adapter("codeSigning").useSigningOperation(signerId, operationId);
  return (
    <TooltipProvider>
      <PageTitle
        title={data?.signerName ? `Signing Operation: ${data.signerName}` : "Signing Operation"}
      />
      <Page />
    </TooltipProvider>
  );
};
