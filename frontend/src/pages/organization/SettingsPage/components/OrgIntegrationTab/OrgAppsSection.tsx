import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faEllipsis, faPlug, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteGitHubApp, useListGitHubApps } from "@app/hooks/api/gitHubApps";

import { AddGitHubAppModal } from "./AddGitHubAppModal";

export const OrgAppsSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "addAppConnection",
    "removeAppConnection"
  ] as const);

  const { currentOrg } = useOrganization();

  const { data: gitHubApps, isPending } = useListGitHubApps(currentOrg?.id);
  const { mutateAsync: deleteGitHubApp } = useDeleteGitHubApp();

  const handleRemove = async () => {
    if (!popUp.removeAppConnection?.data?.id) return;
    try {
      await deleteGitHubApp({ id: popUp.removeAppConnection.data.id as string });
      createNotification({ text: "Successfully removed GitHub App.", type: "success" });
    } catch (err) {
      createNotification({
        text: (err as Error).message || "Failed to delete GitHub App.",
        type: "error"
      });
    } finally {
      handlePopUpClose("removeAppConnection");
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex justify-between">
        <p className="text-xl font-medium text-mineshaft-100">Apps</p>
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <Button
              onClick={() => handlePopUpOpen("addAppConnection")}
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              Add
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <p className="mb-4 text-gray-400">Connect Infisical to other apps for app connections integrations.</p>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Td>Platform</Td>
              <Td>Name</Td>
              <Td>App ID</Td>
              <Td>Slug</Td>
              <Td>Created</Td>
              <Td />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={6} innerKey="github-apps-loading" />}
            {!isPending && gitHubApps && gitHubApps.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <EmptyState title="No app integrations found" icon={faPlug} />
                </Td>
              </Tr>
            )}
            {gitHubApps?.map((app) => (
              <Tr key={app.id}>
                <Td className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faGithub} />
                  GitHub
                </Td>
                <Td>{app.name}</Td>
                <Td>{app.appId}</Td>
                <Td>
                  <a
                    href={`https://github.com/apps/${app.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-400 hover:underline"
                  >
                    {app.slug}
                  </a>
                </Td>
                <Td>{format(new Date(app.createdAt), "yyyy-MM-dd")}</Td>
                <Td>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="rounded-lg">
                      <div className="flex justify-end hover:text-primary-400 data-[state=open]:text-primary-400">
                        <FontAwesomeIcon size="sm" icon={faEllipsis} />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="p-1">
                      <OrgPermissionCan
                        I={OrgPermissionActions.Delete}
                        an={OrgPermissionSubjects.Settings}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            disabled={!isAllowed}
                            className={twMerge(
                              !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpOpen("removeAppConnection", {
                                id: app.id,
                                name: app.name
                              });
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        )}
                      </OrgPermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
      <AddGitHubAppModal
        isOpen={popUp.addAppConnection.isOpen}
        onToggle={(state) => handlePopUpToggle("addAppConnection", state)}
      />
      <DeleteActionModal
        isOpen={popUp.removeAppConnection.isOpen}
        title={`Are you sure you want to remove ${popUp?.removeAppConnection?.data?.name as string}?`}
        onChange={(isOpen) => handlePopUpToggle("removeAppConnection", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleRemove}
      />
    </div>
  );
};
