import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { AlertTriangleIcon, PlusIcon, SearchIcon } from "lucide-react";

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
  useOrganization
} from "@app/context";
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
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
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
              <Button variant="project" isDisabled={!isAllowed} onClick={onCreateSigner}>
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
                <TableRow
                  key={signer.id}
                  className="cursor-pointer hover:bg-mineshaft-700"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/projects/cert-manager/$projectId/code-signing/$signerId",
                      params: {
                        orgId: currentOrg.id,
                        projectId,
                        signerId: signer.id
                      }
                    })
                  }
                >
                  <TableCell>{signer.name}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} className="cursor-default">
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
        {!isLoading && signers.length === 0 && (
          <Empty className="border border-solid">
            <EmptyHeader>
              <EmptyTitle>No signers yet</EmptyTitle>
              <EmptyDescription>Create a signer to start signing artifacts</EmptyDescription>
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
    </Card>
  );
};
