import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";

import { InPlatformMigrationSection } from "./components/InPlatformMigrationSection";
import { SelectImportFromPlatformModal } from "./components/SelectImportFromPlatformModal";

export const ExternalMigrationsTab = () => {
  const { hasOrgRole } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["selectImportPlatform"] as const);

  return (
    <div className="flex flex-col gap-6">
      {/* In-Platform Migration Tooling Section */}
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-medium text-mineshaft-100">In-Platform Migration Tooling</h2>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://infisical.com/docs/documentation/platform/external-migrations/overview"
            >
              <div className="inline-block rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                Docs
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="text-xxs mb-[0.07rem] ml-1.5"
                />
              </div>
            </a>
          </div>
          <p className="mt-1 mb-6 text-sm text-gray-400">
            Connect <span className="text-mineshaft-200">HashiCorp Vault</span> or{" "}
            <span className="text-mineshaft-200">Doppler</span> to enable migration features across
            Infisical: import KV secrets (and from Vault, policies, Kubernetes-related resources,
            and more) directly from the UI.
          </p>
        </div>
        <InPlatformMigrationSection />
      </div>

      {/* Bulk Data Import Section */}
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4">
          <h2 className="text-xl font-medium text-mineshaft-100">Bulk Data Import</h2>
          <p className="mt-1 mb-6 text-sm text-gray-400">
            Perform one-time bulk imports of data from external platforms.
          </p>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-medium text-mineshaft-100">
                Import from external source
              </p>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/documentation/platform/external-migrations/overview"
              >
                <div className="inline-block rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="text-xxs mb-[0.07rem] ml-1.5"
                  />
                </div>
              </a>
            </div>
            <p className="mt-1 text-sm text-gray-400">
              Import data from another platform to Infisical.
            </p>
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

        <SelectImportFromPlatformModal
          isOpen={popUp.selectImportPlatform.isOpen}
          onToggle={(state) => handlePopUpToggle("selectImportPlatform", state)}
        />
      </div>
    </div>
  );
};
