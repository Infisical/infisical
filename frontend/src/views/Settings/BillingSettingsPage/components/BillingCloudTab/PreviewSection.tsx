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
  const { data, isLoading } = useGetOrgPlanBillingInfo(currentOrg?.id ?? "");
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
          orgId: currentOrg.id,
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
            <div className="mb-6 flex flex-1 items-center rounded-lg border border-primary/40 bg-primary/10 p-4">
              <div className="flex-1">
                <h2 className="text-xl font-medium text-mineshaft-100">
                  Unleash the full power of{" "}
                  <span className="bg-gradient-to-r from-primary-500 to-yellow bg-clip-text font-semibold text-transparent">
                    Infisical
                  </span>
                </h2>
                <p className="mt-4 text-gray-400">
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
            <div className="mb-6 flex flex w-full max-w-[12rem] flex-col items-start items-center rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
              <div className="mb-4 flex w-full justify-center font-semibold text-mineshaft-200">
                Want to learn more?{" "}
              </div>
              <div className="flex w-full justify-center">
                <Link href="https://infisical.com/schedule-demo">
                  <span className="cursor-pointer rounded-full border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 duration-200 hover:border-primary/40 hover:bg-primary/10">
                    Book a demo{" "}
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.06rem] ml-1 text-xs"
                    />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}
      {!isLoading && subscription && data && (
        <div className="mb-6 flex">
          <div className="mr-4 flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <p className="mb-2 text-gray-400">Current plan</p>
            <p className="mb-8 text-2xl font-semibold text-mineshaft-50">
              {`${formatPlanSlug(subscription.slug)} ${
                subscription.status === "trialing" ? "(Trial)" : ""
              }`}
            </p>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Billing}>
              {(isAllowed) => (
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentOrg?.id) return;
                    const { url } = await createCustomerPortalSession.mutateAsync(currentOrg.id);
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
          <div className="mr-4 flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <p className="mb-2 text-gray-400">Price</p>
            <p className="mb-8 text-2xl font-semibold text-mineshaft-50">
              {subscription.status === "trialing"
                ? "$0.00 / month"
                : `${formatAmount(data.amount)} / ${data.interval}`}
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <p className="mb-2 text-gray-400">Subscription renews on</p>
            <p className="mb-8 text-2xl font-semibold text-mineshaft-50">
              {formatDate(data.currentPeriodEnd)}
            </p>
          </div>
        </div>
      )}
      <ManagePlansModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
