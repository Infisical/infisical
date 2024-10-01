import Link from "next/link";
import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { SelectImportFromPlatformModal } from "./components/SelectImportFromPlatformModal";

export const ImportTab = () => {
  const { membership } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["selectImportPlatform"] as const);

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xl font-semibold text-mineshaft-100">Import from external source</p>

          <div>
            <Link
              href="https://infisical.com/docs/documentation/guides/migrating-from-envkey"
              passHref
            >
              <a target="_blank" rel="noopener noreferrer">
                <div className="ml-2 inline-block rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="ml-1.5 mb-[0.07rem] text-xxs"
                  />
                </div>
              </a>
            </Link>
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
  );
};
