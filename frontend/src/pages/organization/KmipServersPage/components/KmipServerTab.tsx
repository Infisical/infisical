import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatRelative } from "date-fns";
import {
  CopyIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp, useScopeVariant } from "@app/hooks";
import { useDeleteKmipServerById, useGetKmipServers } from "@app/hooks/api/kmipServers";
import { TKmipServer } from "@app/hooks/api/kmipServers/types";

import { CreateKmipServerModal } from "./CreateKmipServerModal";

const SKELETON_ROWS = ["first", "second", "third"];
const SKELETON_CELLS = ["name", "created", "actions"];

export const KmipServerTab = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const { data: kmipServers, isPending: isLoading } = useGetKmipServers();
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const scopeVariant = useScopeVariant();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deleteKmipServer",
      "createKmipServer"
    ] as const);

    const navigate = useNavigate();

    const deleteKmipServerById = useDeleteKmipServerById();

    const handleDeleteKmipServer = async () => {
      const data = popUp.deleteKmipServer.data as { id: string };
      await deleteKmipServerById.mutateAsync(data.id);

      handlePopUpToggle("deleteKmipServer");
      createNotification({
        type: "success",
        text: "Successfully deleted KMIP server"
      });
    };

    const filteredKmipServers = kmipServers?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    const kmipServerToDelete = popUp.deleteKmipServer.data as TKmipServer | undefined;
    const isTableEmpty = !isLoading && !filteredKmipServers?.length;

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            KMIP Servers
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms/kmip" />
          </CardTitle>
          <CardDescription>
            Create and configure KMIP servers that proxy KMIP requests to Infisical KMS
          </CardDescription>
          <CardAction>
            <OrgPermissionCan
              I={OrgKmipServerPermissionActions.CreateKmipServers}
              a={OrgPermissionSubjects.KmipServer}
            >
              {(isAllowed) => (
                <Button
                  variant={scopeVariant}
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("createKmipServer")}
                >
                  <PlusIcon />
                  Create KMIP Server
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <InputGroup className="mb-4">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search KMIP servers..."
            />
          </InputGroup>
          {isTableEmpty ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {kmipServers?.length ? <SearchIcon /> : <ServerIcon />}
                </EmptyMedia>
                <EmptyTitle>
                  {kmipServers?.length
                    ? "No KMIP servers match your search"
                    : "No KMIP servers configured"}
                </EmptyTitle>
                <EmptyDescription>
                  {kmipServers?.length
                    ? "Try a different search term."
                    : "Create a KMIP server to proxy KMIP requests to Infisical KMS."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-2/3">
                    <TableHeadLabel>Name</TableHeadLabel>
                  </TableHead>
                  <TableHead>
                    <TableHeadLabel>Created</TableHeadLabel>
                  </TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  SKELETON_ROWS.map((row) => (
                    <TableRow key={`kmip-server-skeleton-${row}`}>
                      {SKELETON_CELLS.map((cell) => (
                        <TableCell key={`kmip-server-skeleton-${row}-${cell}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {filteredKmipServers?.map((el) => (
                  <TableRow
                    key={el.id}
                    onClick={() => {
                      navigate({
                        to: "/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId",
                        params: { orgId, kmipServerId: el.id }
                      });
                    }}
                  >
                    <TableCell isTruncatable>{el.name}</TableCell>
                    <TableCell>{formatRelative(new Date(el.createdAt), new Date())}</TableCell>
                    <TableCell variant="action" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton aria-label="KMIP server options" variant="ghost" size="sm">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(el.id)}>
                            <CopyIcon />
                            Copy ID
                          </DropdownMenuItem>
                          <OrgPermissionCan
                            I={OrgKmipServerPermissionActions.DeleteKmipServers}
                            a={OrgPermissionSubjects.KmipServer}
                          >
                            {(isAllowed: boolean) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                variant="danger"
                                onClick={() => handlePopUpOpen("deleteKmipServer", el)}
                              >
                                <TrashIcon />
                                Delete KMIP Server
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <DeleteConfirmDialog
          isOpen={popUp.deleteKmipServer.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("deleteKmipServer", isOpen)}
          title={`Delete KMIP Server ${kmipServerToDelete?.name || ""}?`}
          description={
            <Alert variant="danger" appearance="borderless">
              <AlertDescription>
                This permanently removes the KMIP server {kmipServerToDelete?.name} from your
                organization. This cannot be undone.
              </AlertDescription>
            </Alert>
          }
          confirmKey={kmipServerToDelete?.name || ""}
          confirmLabel="Delete KMIP Server"
          isPending={deleteKmipServerById.isPending}
          onConfirm={handleDeleteKmipServer}
        />
        <CreateKmipServerModal
          isOpen={popUp.createKmipServer.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("createKmipServer", isOpen)}
        />
      </Card>
    );
  },
  {
    action: OrgKmipServerPermissionActions.ListKmipServers,
    subject: OrgPermissionSubjects.KmipServer,
    accessRestrictedMode: "dialog"
  }
);
