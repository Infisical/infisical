/* eslint-disable @typescript-eslint/no-unused-vars */
import { useRouter } from "next/router";
import { faChevronLeft, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan, ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip
} from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization
} from "@app/context";
import { withPermission } from "@app/hoc";
import { useDeleteSshCa, useGetSshCaById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { SshCaDetailsSection, SshCertificateTemplatesSection } from "./components";

export const SshCaPage = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const router = useRouter();
    const caId = router.query.caId as string;
    const { data } = useGetSshCaById(caId);

    const { mutateAsync: deleteSshCa } = useDeleteSshCa();

    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "sshCa",
      "deleteSshCa"
    ] as const);

    const onRemoveCaSubmit = async (caIdToDelete: string) => {
      try {
        if (!currentOrg?.id) return;

        await deleteSshCa({ caId: caIdToDelete });

        await createNotification({
          text: "Successfully deleted SSH CA",
          type: "success"
        });

        handlePopUpClose("deleteSshCa");
        router.push(`/org/${currentOrg.id}/ssh`);
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to delete SSH CA",
          type: "error"
        });
      }
    };

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        {data && (
          <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
            <Button
              variant="link"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
              onClick={() => router.push(`/org/${currentOrg?.id}/ssh`)}
              className="mb-4"
            >
              SSH Certificate Authorities
            </Button>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-3xl font-semibold text-white">{data.friendlyName}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="rounded-lg">
                  <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                    <Tooltip content="More options">
                      <FontAwesomeIcon size="sm" icon={faEllipsis} />
                    </Tooltip>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="p-1">
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    a={OrgPermissionSubjects.SshCertificateAuthorities}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          isAllowed
                            ? "hover:!bg-red-500 hover:!text-white"
                            : "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() =>
                          handlePopUpOpen("deleteSshCa", {
                            caId: data.id
                          })
                        }
                        disabled={!isAllowed}
                      >
                        Delete SSH CA
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex">
              <div className="mr-4 w-96">
                <SshCaDetailsSection caId={caId} handlePopUpOpen={handlePopUpOpen} />
              </div>
              <div className="w-full">
                <SshCertificateTemplatesSection caId={caId} />
              </div>
            </div>
          </div>
        )}
        <DeleteActionModal
          isOpen={popUp.deleteSshCa.isOpen}
          title="Are you sure want to remove the SSH CA from the project?"
          onChange={(isOpen) => handlePopUpToggle("deleteSshCa", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onRemoveCaSubmit((popUp?.deleteSshCa?.data as { caId: string })?.caId)
          }
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.SshCertificateAuthorities }
);
