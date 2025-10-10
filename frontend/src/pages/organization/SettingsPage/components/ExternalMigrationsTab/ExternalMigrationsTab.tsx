import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";

import { SelectImportFromPlatformModal } from "./components/SelectImportFromPlatformModal";

export const ExternalMigrationsTab = () => {
  const { hasOrgRole } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["selectImportPlatform"] as const);

  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 rounded-lg border p-4">
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <p className="text-mineshaft-100 text-xl font-medium">Import from external source</p>

          <div>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://infisical.com/docs/documentation/platform/external-migrations/overview"
            >
              <div className="bg-yellow/20 text-yellow ml-2 inline-block rounded-md px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
        </div>

        <Button
          onClick={() => {
            handlePopUpOpen("selectImportPlatform");
          }}
          isDisabled={!hasOrgRole(OrgMembershipRole.Admin)}
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
  );
};
