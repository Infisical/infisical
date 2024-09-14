import Link from "next/link";
import { faArrowUpRightFromSquare, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, UpgradePlanModal } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { withPermission } from "@app/hoc";
import { useDeleteIdentity } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

// import { IdentityAuthMethodModal } from "./IdentityAuthMethodModal";
import { IdentityModal } from "./IdentityModal";
import { IdentityTable } from "./IdentityTable";
import { IdentityTokenAuthTokenModal } from "./IdentityTokenAuthTokenModal";
// import { IdentityUniversalAuthClientSecretModal } from "./IdentityUniversalAuthClientSecretModal";

export const IdentitySection = withPermission(
  () => {
    const { subscription } = useSubscription();
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";

    const { mutateAsync: deleteMutateAsync } = useDeleteIdentity();
    const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
      "identity",
      "identityAuthMethod",
      "deleteIdentity",
      "universalAuthClientSecret",
      "deleteUniversalAuthClientSecret",
      "upgradePlan",
      "tokenAuthToken"
    ] as const);

    const isMoreIdentitiesAllowed = subscription?.identityLimit
      ? subscription.identitiesUsed < subscription.identityLimit
      : true;

    const isEnterprise = subscription?.slug === "enterprise"

    const onDeleteIdentitySubmit = async (identityId: string) => {
      try {
        await deleteMutateAsync({
          identityId,
          organizationId: orgId
        });

        createNotification({
          text: "Successfully deleted identity",
          type: "success"
        });

        handlePopUpClose("deleteIdentity");
      } catch (err) {
        console.error(err);
        const error = err as any;
        const text = error?.response?.data?.message ?? "Failed to delete identity";

        createNotification({
          text,
          type: "error"
        });
      }
    };

    return (
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Identities</p>
          <div className="flex w-full justify-end pr-4">
            <Link href="https://infisical.com/docs/documentation/platform/identities/overview">
              <a
                target="_blank"
                rel="noopener noreferrer"
                className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white"
              >
                Documentation{" "}
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.06rem] ml-1 text-xs"
                />
              </a>
            </Link>
          </div>
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Identity}>
            {(isAllowed) => (
              <Button
                colorSchema="primary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  if (!isMoreIdentitiesAllowed && !isEnterprise) {
                    handlePopUpOpen("upgradePlan", {
                      description: "You can add more identities if you upgrade your Infisical plan."
                    });
                    return;
                  }
                  handlePopUpOpen("identity");
                }}
                isDisabled={!isAllowed}
              >
                Create identity
              </Button>
            )}
          </OrgPermissionCan>
        </div>
        <IdentityTable handlePopUpOpen={handlePopUpOpen} />
        <IdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        {/* <IdentityAuthMethodModal
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        /> */}
        {/* <IdentityUniversalAuthClientSecretModal
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
        /> */}
        <IdentityTokenAuthTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <DeleteActionModal
          isOpen={popUp.deleteIdentity.isOpen}
          title={`Are you sure want to delete ${
            (popUp?.deleteIdentity?.data as { name: string })?.name || ""
          }?`}
          onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={() =>
            onDeleteIdentitySubmit(
              (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
            )
          }
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={(popUp.upgradePlan?.data as { description: string })?.description}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Identity }
);
