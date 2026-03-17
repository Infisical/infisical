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
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
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
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            Signers
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/code-signing" />
          </UnstableCardTitle>
          <UnstableCardDescription>
            Manage signers and control who can sign artifacts.
          </UnstableCardDescription>
          <UnstableCardAction>
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
          </UnstableCardAction>
        </UnstableCardHeader>
        <UnstableCardContent>
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
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead>Name</UnstableTableHead>
                <UnstableTableHead>Status</UnstableTableHead>
                <UnstableTableHead>Certificate CN</UnstableTableHead>
                <UnstableTableHead>Policy</UnstableTableHead>
                <UnstableTableHead>Certificate Expiry</UnstableTableHead>
                <UnstableTableHead>Last Signed</UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {!isLoading &&
                signers.map((signer) => (
                  <UnstableTableRow
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
                    <UnstableTableCell>{signer.name}</UnstableTableCell>
                    <UnstableTableCell>
                      <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                        {signerStatusLabels[signer.status] ?? signer.status}
                      </Badge>
                    </UnstableTableCell>
                    <UnstableTableCell>{signer.certificateCommonName ?? "-"}</UnstableTableCell>
                    <UnstableTableCell>{signer.approvalPolicyName ?? "-"}</UnstableTableCell>
                    <UnstableTableCell>
                      {signer.certificateNotAfter
                        ? format(new Date(signer.certificateNotAfter), "MMM d, yyyy")
                        : "-"}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      {signer.lastSignedAt
                        ? format(new Date(signer.lastSignedAt), "MMM d, yyyy HH:mm")
                        : "Never"}
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <UnstableIconButton variant="ghost" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontalIcon />
                          </UnstableIconButton>
                        </UnstableDropdownMenuTrigger>
                        <UnstableDropdownMenuContent
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <UnstableDropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(signer.id);
                            }}
                          >
                            <ClipboardCopyIcon />
                            Copy ID
                          </UnstableDropdownMenuItem>
                          <ProjectPermissionCan
                            I={ProjectPermissionCodeSigningActions.Edit}
                            a={ProjectPermissionSub.CodeSigners}
                          >
                            {(isAllowed) => (
                              <UnstableDropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => setEditSigner(signer)}
                              >
                                <PencilIcon />
                                Edit Signer
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionCodeSigningActions.Edit}
                            a={ProjectPermissionSub.CodeSigners}
                          >
                            {(isAllowed) => (
                              <UnstableDropdownMenuItem
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
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionCodeSigningActions.Delete}
                            a={ProjectPermissionSub.CodeSigners}
                          >
                            {(isAllowed) => (
                              <UnstableDropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => setDeleteSignerId(signer.id)}
                              >
                                Delete Signer
                              </UnstableDropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </UnstableDropdownMenuContent>
                      </UnstableDropdownMenu>
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
            </UnstableTableBody>
          </UnstableTable>
          {!isLoading && signers.length === 0 && (
            <UnstableEmpty>
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>No signers found</UnstableEmptyTitle>
              </UnstableEmptyHeader>
            </UnstableEmpty>
          )}
          {Boolean(totalCount) && (
            <UnstablePagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          )}
        </UnstableCardContent>
      </UnstableCard>
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
