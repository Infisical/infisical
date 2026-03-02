import { useEffect } from "react";
import { faArrowUpRightFromSquare, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Tooltip } from "@app/components/v2";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  useCreateCustomerPortalSession,
  useGetOrgPlanBillingInfo,
  useGetOrgTrialUrl
} from "@app/hooks/api";
import { subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";
import { usePopUp } from "@app/hooks/usePopUp";

import { ManagePlansModal } from "./ManagePlansModal";

export const PreviewSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription(true);
  const queryClient = useQueryClient();
  const { data, isPending } = useGetOrgPlanBillingInfo(currentOrg?.id ?? "");

  const totalAmount = data?.amount ? data.amount * (data.users + data.identities) : 0;

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

  useEffect(() => {
    queryClient.invalidateQueries({
      queryKey: subscriptionQueryKeys.getOrgSubsription(currentOrg?.id ?? "")
    });
  }, []);

  const formatDate = (date: number) => {
    const createdDate = new Date(date * 1000);
    const day: number = createdDate.getDate();
    const month: number = createdDate.getMonth() + 1;
    const year: number = createdDate.getFullYear();
    const formattedDate: string = `${day}/${month}/${year}`;

    return formattedDate;
  };

  function formatPlanSlug(slug: string) {
    if (!slug) {
      return "-";
    }
    return slug.replace(/(\b[a-z])/g, (match) => match.toUpperCase()).replace(/-/g, " ");
  }

  const handleUpgradeBtnClick = async () => {
    try {
      if (!subscription || !currentOrg) return;

      if (!isInfisicalCloud()) {
        window.open("https://infisical.com/pricing", "_blank");
        return;
      }

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

  const getUpgradePlanLabel = () => {
    if (!isInfisicalCloud()) {
      return (
        <div>
          Go to Pricing
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="mb-[0.06rem] ml-1 text-xs" />
        </div>
      );
    }

    return !subscription.has_used_trial ? "Start Pro Free Trial" : "Upgrade Plan";
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
                  <span className="bg-linear-to-r from-primary-500 to-yellow bg-clip-text font-medium text-transparent">
                    Infisical
                  </span>
                </h2>
                <p className="mt-4 text-gray-400">
                  Get unlimited members, projects, RBAC, smart alerts, and so much more.
                </p>
              </div>
              <OrgPermissionCan
                I={OrgPermissionBillingActions.ManageBilling}
                a={OrgPermissionSubjects.Billing}
              >
                {(isAllowed) => (
                  <Button
                    onClick={() => handleUpgradeBtnClick()}
                    color="mineshaft"
                    isDisabled={!isAllowed}
                  >
                    {getUpgradePlanLabel()}
                  </Button>
                )}
              </OrgPermissionCan>
            </div>
            <div className="mb-6 flex w-full max-w-48 flex-col items-center rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
              <div className="mb-4 flex w-full justify-center font-medium text-mineshaft-200">
                Want to learn more?{" "}
              </div>
              <div className="flex w-full justify-center">
                <a
                  href="https://infisical.com/talk-to-us"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="cursor-pointer rounded-full border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 duration-200 hover:border-primary/40 hover:bg-primary/10">
                    Book a demo{" "}
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.06rem] ml-1 text-xs"
                    />
                  </span>
                </a>
              </div>
            </div>
          </div>
        )}
      {!isPending && subscription && data && (
        <div className="mb-6 flex">
          <div className="mr-4 flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <p className="mb-2 text-gray-400">Current plan</p>
            <p className="mb-8 text-2xl font-medium text-mineshaft-50">
              {`${formatPlanSlug(subscription.slug)} ${
                subscription.status === "trialing" ? "(Trial)" : ""
              }`}
            </p>
            {isInfisicalCloud() && (
              <OrgPermissionCan
                I={OrgPermissionBillingActions.ManageBilling}
                a={OrgPermissionSubjects.Billing}
              >
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
            )}
          </div>
          {subscription.slug !== "enterprise" ? (
            <div className="mr-4 flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
              <p className="mb-2 text-gray-400">Price</p>
              <p className="mb-8 text-2xl font-medium text-mineshaft-50">
                {subscription.status === "trialing" ? (
                  "$0.00 / month"
                ) : (
                  <>
                    {formatAmount(totalAmount)} / {data.interval}
                    {(subscription.slug === "pro" || subscription.slug === "pro-annual") && (
                      <Tooltip
                        content={`Total price is based on the number of users and machine identities at ${formatAmount(data.amount)} each. You have ${data.users} ${data.users > 1 ? "users" : "user"} and ${data.identities} ${data.identities > 1 ? "machine identities" : "machine identity"}.`}
                        className="max-w-lg"
                      >
                        <FontAwesomeIcon icon={faInfoCircle} className="ml-2" size="xs" />
                      </Tooltip>
                    )}
                  </>
                )}
              </p>
            </div>
          ) : null}
          <div className="flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <p className="mb-2 text-gray-400">Subscription renews on</p>
            <p className="mb-8 text-2xl font-medium text-mineshaft-50">
              {data.currentPeriodEnd ? formatDate(data.currentPeriodEnd) : "-"}
            </p>
          </div>
        </div>
      )}
      <ManagePlansModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
