import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faEllipsis, faPlug, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
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

export const GitHubAppsTable = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "removeAppConnection"
  ] as const);

  const { currentOrg } = useOrganization();

  const { data: gitHubApps, isPending } = useListGitHubApps(currentOrg?.id);
  const { mutateAsync: deleteGitHubApp } = useDeleteGitHubApp();

  const handleRemove = async () => {
    if (!popUp.removeAppConnection?.data?.id) return;
    try {
      await deleteGitHubApp({ id: popUp.removeAppConnection.data.id as string });
      createNotification({ text: "Successfully removed app.", type: "success" });
    } catch (err) {
      createNotification({
        text: (err as Error).message || "Failed to app.",
        type: "error"
      });
    } finally {
      handlePopUpClose("removeAppConnection");
    }
  };

  return (
    <>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Td>Platform</Td>
              <Td>Name</Td>
              <Td>App ID</Td>
              <Td>Slug</Td>
              <Td />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={5} innerKey="github-apps-loading" />}
            {!isPending && gitHubApps && gitHubApps.length === 0 && (
              <Tr>
                <Td colSpan={5}>
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
                            isDisabled={!isAllowed}
                            icon={<FontAwesomeIcon icon={faTrash} />}
                            className={twMerge(
                              "text-red",
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
                            Delete app
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
      <DeleteActionModal
        isOpen={popUp.removeAppConnection.isOpen}
        title={`Are you sure you want to remove ${popUp?.removeAppConnection?.data?.name as string}?`}
        onChange={(isOpen) => handlePopUpToggle("removeAppConnection", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleRemove}
      />
    </>
  );
};
