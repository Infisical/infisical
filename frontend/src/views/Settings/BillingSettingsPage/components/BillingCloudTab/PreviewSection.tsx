import Link from "next/link";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import {
  useCreateCustomerPortalSession,
  useGetOrgPlanBillingInfo,
  useGetOrgTrialUrl
} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { ManagePlansModal } from "./ManagePlansModal";

export const PreviewSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { data, isLoading } = useGetOrgPlanBillingInfo(currentOrg?._id ?? "");
  const getOrgTrialUrl = useGetOrgTrialUrl();
  const createCustomerPortalSession = useCreateCustomerPortalSession();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["managePlan"] as const);

  const formatAmount = (amount: number) => {
    const formattedTotal = (Math.floor(amount) / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD"
    });

    return formattedTotal;
  };

  const formatDate = (date: number) => {
    const createdDate = new Date(date * 1000);
    const day: number = createdDate.getDate();
    const month: number = createdDate.getMonth() + 1;
    const year: number = createdDate.getFullYear();
    const formattedDate: string = `${day}/${month}/${year}`;

    return formattedDate;
  };

  function formatPlanSlug(slug: string) {
    return slug.replace(/(\b[a-z])/g, (match) => match.toUpperCase()).replace(/-/g, " ");
  }

  const handleUpgradeBtnClick = async () => {
    try {
      if (!subscription || !currentOrg) return;

      if (!subscription.has_used_trial) {
        // direct user to start pro trial
        const url = await getOrgTrialUrl.mutateAsync({
          orgId: currentOrg._id,
          success_url: window.location.href
        });

        window.location.href = url;
      } else {
        // open compare plans modal
        handlePopUpOpen("managePlan");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      {subscription &&
        subscription?.slug !== "enterprise" &&
        subscription?.slug !== "pro" &&
        subscription?.slug !== "pro-annual" && (
          <div className="flex flex-row space-x-6">
            <div className="p-4 rounded-lg flex-1 border border-primary/40 mb-6 flex items-center bg-primary/10">
              <div className="flex-1">
                <h2 className="text-xl font-medium text-mineshaft-100">Unleash the full power of <span className="text-transparent font-semibold bg-clip-text bg-gradient-to-r from-primary-500 to-yellow">Infisical</span></h2>
                <p className="text-gray-400 mt-4">
                  Get unlimited members, projects, RBAC, smart alerts, and so much more.
                </p>
              </div>
              <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Billing}>
                {(isAllowed) => (
                  <Button
                    onClick={() => handleUpgradeBtnClick()}
                    color="mineshaft"
                    isDisabled={!isAllowed}
                  >
                    {!subscription.has_used_trial ? "Start Pro Free Trial" : "Upgrade Plan"}
                  </Button>
                )}
              </OrgPermissionCan>
            </div>
            <div className="flex flex-col max-w-[12rem] w-full items-start border border-mineshaft-600 mb-6 flex items-center bg-mineshaft-800 p-4 rounded-lg">
              <div className="mb-4 flex justify-center w-full font-semibold text-mineshaft-200">Want to learn more? </div>
              <div className="flex justify-center w-full">
                <Link href="https://infisical.com/schedule-demo">
                  <span className="rounded-full px-4 py-2 bg-mineshaft-600 border border-mineshaft-500 hover:bg-primary/10 hover:border-primary/40 duration-200 cursor-pointer">
                    Book a demo <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs mb-[0.06rem] ml-1"/>
                  </span>
                </Link> 
              </div>
            </div>
          </div>
        )}
      {!isLoading && subscription && data && (
        <div className="flex mb-6">
          <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 mr-4 border border-mineshaft-600">
            <p className="mb-2 text-gray-400">Current plan</p>
            <p className="text-2xl text-mineshaft-50 font-semibold mb-8">
              {`${formatPlanSlug(subscription.slug)} ${
                subscription.status === "trialing" ? "(Trial)" : ""
              }`}
            </p>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Billing}>
              {(isAllowed) => (
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentOrg?._id) return;
                    const { url } = await createCustomerPortalSession.mutateAsync(currentOrg._id);
                    window.location.href = url;
                  }}
                  disabled={!isAllowed}
                  className="text-primary"
                >
                  Manage plan &rarr;
                </button>
              )}
            </OrgPermissionCan>
          </div>
          <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 border border-mineshaft-600 mr-4">
            <p className="mb-2 text-gray-400">Price</p>
            <p className="text-2xl mb-8 text-mineshaft-50 font-semibold">
              {subscription.status === "trialing"
                ? "$0.00 / month"
                : `${formatAmount(data.amount)} / ${data.interval}`}
            </p>
          </div>
          <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 border border-mineshaft-600">
            <p className="mb-2 text-gray-400">Subscription renews on</p>
            <p className="text-2xl mb-8 text-mineshaft-50 font-semibold">
              {formatDate(data.currentPeriodEnd)}
            </p>
          </div>
        </div>
      )}
      <ManagePlansModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
