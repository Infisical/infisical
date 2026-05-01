import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  CheckCircleIcon,
  ClipboardCopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import {
  getSignerStatusBadgeVariant,
  SignerStatus,
  signerStatusLabels,
  TSigner,
  useDeleteSigner,
  useListSigners,
  useUpdateSigner
} from "@app/hooks/api/signers";
import { useDebounce } from "@app/hooks/useDebounce";

import { EditSignerModal } from "../../SignerDetailPage/components/EditSignerModal";

type Props = {
  projectId: string;
  onCreateSigner: () => void;
};

const PAGE_SIZE = 25;

export const SignersTable = ({ projectId, onCreateSigner }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [deleteSignerId, setDeleteSignerId] = useState<string | null>(null);
  const [editSigner, setEditSigner] = useState<TSigner | null>(null);

  const { data, isLoading } = useListSigners({
    projectId,
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch || undefined
  });

  const deleteSigner = useDeleteSigner();
  const updateSigner = useUpdateSigner();

  const signers = data?.signers ?? [];
  const totalCount = data?.totalCount ?? 0;

  const handleDeleteConfirm = async () => {
    if (!deleteSignerId) return;
    await deleteSigner.mutateAsync({ signerId: deleteSignerId, projectId });
    setDeleteSignerId(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Signers
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/code-signing" />
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
                <TableHead>Policy</TableHead>
                <TableHead>Certificate Expiry</TableHead>
                <TableHead>Last Signed</TableHead>
                <TableHead className="w-5" />
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
                    <TableCell>
                      <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                        {signerStatusLabels[signer.status] ?? signer.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{signer.certificateCommonName ?? "-"}</TableCell>
                    <TableCell>{signer.approvalPolicyName ?? "-"}</TableCell>
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton variant="ghost" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(signer.id);
                            }}
                          >
                            <ClipboardCopyIcon />
                            Copy ID
                          </DropdownMenuItem>
                          <ProjectPermissionCan
                            I={ProjectPermissionCodeSigningActions.Edit}
                            a={ProjectPermissionSub.CodeSigners}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => setEditSigner(signer)}
                              >
                                <PencilIcon />
                                Edit Signer
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionCodeSigningActions.Edit}
                            a={ProjectPermissionSub.CodeSigners}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() =>
                                  updateSigner.mutateAsync({
                                    signerId: signer.id,
                                    status:
                                      signer.status === SignerStatus.Active
                                        ? SignerStatus.Disabled
                                        : SignerStatus.Active
                                  })
                                }
                              >
                                {signer.status === SignerStatus.Active ? (
                                  <>
                                    <BanIcon />
                                    Disable Signer
                                  </>
                                ) : (
                                  <>
                                    <CheckCircleIcon />
                                    Enable Signer
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionCodeSigningActions.Delete}
                            a={ProjectPermissionSub.CodeSigners}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => setDeleteSignerId(signer.id)}
                              >
                                Delete Signer
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          {!isLoading && signers.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No signers found</EmptyTitle>
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
      <DeleteActionModal
        isOpen={Boolean(deleteSignerId)}
        deleteKey="delete"
        title="Are you sure you want to delete this signer?"
        onChange={(isOpen) => {
          if (!isOpen) setDeleteSignerId(null);
        }}
        onDeleteApproved={handleDeleteConfirm}
      />
      {editSigner && (
        <EditSignerModal
          isOpen={Boolean(editSigner)}
          onOpenChange={(open) => {
            if (!open) setEditSigner(null);
          }}
          signer={editSigner}
          projectId={projectId}
        />
      )}
    </>
  );
};
