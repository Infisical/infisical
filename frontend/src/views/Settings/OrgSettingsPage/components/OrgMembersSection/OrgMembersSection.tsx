import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    Button,
    UpgradePlanModal
} from "@app/components/v2";
import { useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AddOrgMemberModal } from "./AddOrgMemberModal";
import { OrgMembersTable } from "./OrgMembersTable";

export const OrgMembersSection = () => {
    const { subscription } = useSubscription();
    const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
        "addMember",
        "upgradePlan",
    ] as const);

    const isMoreMembersAllowed = subscription?.memberLimit ? (subscription.membersUsed < subscription.memberLimit) : true;

    return (
        <div className="mb-6 p-4 bg-mineshaft-900 max-w-screen-lg rounded-lg border border-mineshaft-600">
            <div className="flex justify-between mb-8">
                <p className="text-xl font-semibold text-mineshaft-100">
                    Organization members
                </p>
                <Button
                    colorSchema="secondary"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => {
                        if (isMoreMembersAllowed) {
                            handlePopUpOpen("addMember");
                            return;
                        }
                        handlePopUpOpen("upgradePlan");
                    }}
                >
                    Add Member
                </Button>
            </div>
            <OrgMembersTable />
            <UpgradePlanModal
                isOpen={popUp.upgradePlan.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                text="Add more members by upgrading to a higher Infisical plan."
            />
            <AddOrgMemberModal 
                popUp={popUp}
                handlePopUpToggle={handlePopUpToggle}
                handlePopUpClose={handlePopUpClose}
            />
        </div>
    );
}