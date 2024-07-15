import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, UpgradePlanModal } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";

import { AddExternalKmsForm } from "./AddExternalKmsForm";

export const OrgEncryptionTab = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "upgradePlan",
      "addExternalKMS"
    ] as const);
    const { subscription } = useSubscription();

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Encryption</p>
          <Button
            onClick={() => {
              handlePopUpOpen("addExternalKMS");
              // if (subscription && !subscription?.auditLogStreams) {
              //   handlePopUpOpen("upgradePlan");
              //   return;
              // }
              // handlePopUpOpen("auditLogStreamForm");
            }}
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Add
          </Button>
        </div>
        <p className="mb-4 text-gray-400">
          Configure the Key Management System used for encrypting/decrypting your data at rest
        </p>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="You can add audit log streams if you switch to Infisical's Enterprise  plan."
        />
        <AddExternalKmsForm
          isOpen={popUp.addExternalKMS.isOpen}
          onToggle={(state) => handlePopUpToggle("addExternalKMS", state)}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Edit, subject: OrgPermissionSubjects.Settings }
);
