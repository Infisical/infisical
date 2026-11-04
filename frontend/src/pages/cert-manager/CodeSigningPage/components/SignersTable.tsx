import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangleIcon, PlusIcon, SearchIcon } from "lucide-react";

import { CodeSigningUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub,
  useProject,
  useSubscription
} from "@app/context";
import { getInstancePinningLink } from "@app/helpers/project";
import {
  getSignerStatusBadgeVariant,
  SIGNER_TABLE_PAGE_SIZE,
  SignerStatus,
  signerStatusLabels,
  useListSigners
} from "@app/hooks/api/signers";
import { useDebounce } from "@app/hooks/useDebounce";

import { PkiDocsUrls } from "../../pki-docs-urls";

type Props = {
  projectId: string;
  onCreateSigner: () => void;
};

export const SignersTable = ({ projectId, onCreateSigner }: Props) => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const handleCreateSigner = () => {
    if (!subscription.pkiCodeSigning) {
      openUpgradeGate({
        intent: CodeSigningUpgradeIntent,
        paywallKey: "cert-manager.signers"
      });
      return;
    }
    onCreateSigner();
  };
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(SIGNER_TABLE_PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const { data, isLoading } = useListSigners({
    projectId,
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch || undefined
  });

  const signers = data?.signers ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Signers
          <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.signers.overview} />
        </CardTitle>
        <CardDescription>Manage signers and control who can sign artifacts.</CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionCodeSigningActions.Create}
            a={ProjectPermissionSub.CodeSigners}
          >
            {(isAllowed) => (
              <Button variant="project" isDisabled={!isAllowed} onClick={handleCreateSigner}>
                <PlusIcon />
                Create Signer
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search signers by name..."
            />
          </InputGroup>
        </div>
        {isLoading || signers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Certificate CN</TableHead>
                <TableHead>Certificate Expiry</TableHead>
                <TableHead>Last Signed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading &&
                signers.map((signer) => (
                  <TableRow key={signer.id} className="hover:bg-surface-hover" linked>
                    <TableCell>
                      <RowLink
                        {...getInstancePinningLink(
                          currentProject.orgId,
                          currentProject,
                          `code-signing/${signer.id}`
                        )!}
                      >
                        {signer.name}
                      </RowLink>
                    </TableCell>
                    <TableCell data-row-interactive className="cursor-default">
                      {signer.certificateFailureReason &&
                      (signer.status === SignerStatus.Failed ||
                        signer.status === SignerStatus.Pending) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-1.5">
                              <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                                {signerStatusLabels[signer.status] ?? signer.status}
                              </Badge>
                              {signer.status === SignerStatus.Pending && (
                                <AlertTriangleIcon
                                  className="size-3.5 shrink-0 text-warning"
                                  aria-hidden
                                />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="start"
                            className="max-w-[320px] text-pretty break-words"
                          >
                            {signer.status === SignerStatus.Pending && (
                              <span className="mb-0.5 block text-[10px] tracking-wide text-muted uppercase">
                                Last attempt failed, retrying
                              </span>
                            )}
                            {signer.certificateFailureReason}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                          {signerStatusLabels[signer.status] ?? signer.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{signer.certificateCommonName ?? "-"}</TableCell>
                    <TableCell>
                      {signer.certificateNotAfter
                        ? format(new Date(signer.certificateNotAfter), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {signer.lastSignedAt
                        ? format(new Date(signer.lastSignedAt), "MMM d, yyyy HH:mm")
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border border-solid">
            <EmptyHeader>
              <EmptyTitle>
                {debouncedSearch ? "No signers match search" : "No signers yet"}
              </EmptyTitle>
              <EmptyDescription>
                {debouncedSearch
                  ? "Try adjusting your search"
                  : "Create a signer to start signing artifacts"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {Boolean(totalCount) && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
      </CardContent>
      {upgradeGate}
    </Card>
  );
};
