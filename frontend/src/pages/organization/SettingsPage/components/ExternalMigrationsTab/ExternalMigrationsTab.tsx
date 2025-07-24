import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { SelectImportFromPlatformModal } from "./components/SelectImportFromPlatformModal";

export const ExternalMigrationsTab = () => {
  const { membership } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["selectImportPlatform"] as const);

  return (
    <OrgPermissionCan
      I={OrgPermissionActions.Create}
      a={OrgPermissionSubjects.Workspace}
      renderGuardBanner
      passThrough={false}
    >
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold text-mineshaft-100">Import from external source</p>

            <div>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/documentation/platform/external-migrations/overview"
              >
                <div className="ml-2 inline-block rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-xxs"
                  />
                </div>
              </a>
            </div>
          </div>

          <Button
            onClick={() => {
              handlePopUpOpen("selectImportPlatform");
            }}
            isDisabled={membership?.role !== ProjectMembershipRole.Admin}
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Import
          </Button>
        </div>
        <p className="mb-4 text-gray-400">Import data from another platform to Infisical.</p>

        <SelectImportFromPlatformModal
          isOpen={popUp.selectImportPlatform.isOpen}
          onToggle={(state) => handlePopUpToggle("selectImportPlatform", state)}
        />
      </div>
    </OrgPermissionCan>
  );
};
