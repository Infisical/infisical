import { Button } from "@app/components/v2";
import { useOrganization,useSubscription  } from "@app/context";
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
    
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
        "managePlan"
    ] as const);
    
    const formatAmount = (amount: number) => {
        const formattedTotal = (Math.floor(amount) / 100).toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
        });
        
        return formattedTotal;
    }
    
    const formatDate = (date: number) => {
        const createdDate = new Date(date * 1000);
        const day: number = createdDate.getDate();
        const month: number = createdDate.getMonth() + 1;
        const year: number = createdDate.getFullYear();
        const formattedDate: string = `${day}/${month}/${year}`;
        
        return formattedDate;
    }

    function formatPlanSlug(slug: string) {
        return slug
            .replace(/(\b[a-z])/g, match => match.toUpperCase())
            .replace(/-/g, " ");
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
    }
    
    return (
        <div>
            {subscription && subscription?.slug !== "enterprise" && subscription?.slug !== "pro" && subscription?.slug !== "pro-annual" && (
                <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 border border-mineshaft-600 mb-6 flex items-center bg-mineshaft-600 max-w-screen-lg">
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-mineshaft-50">Become Infisical</h2>
                        <p className="text-gray-400 mt-4">Unlimited members, projects, RBAC, smart alerts, and so much more</p>
                    </div>
                    <Button 
                        // onClick={() => handlePopUpOpen("managePlan")}
                        onClick={() => handleUpgradeBtnClick()}
                        color="mineshaft"
                    >
                        {!subscription.has_used_trial ? "Start Pro Free Trial" : "Upgrade Plan"}
                    </Button>
                </div>
            )}
            {!isLoading && subscription && data && (
                <div className="flex mb-6 max-w-screen-lg">
                    <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 mr-4 border border-mineshaft-600">
                        <p className="mb-2 text-gray-400">Current plan</p>
                        <p className="text-2xl text-mineshaft-50 font-semibold mb-8"> 
                            {`${formatPlanSlug(subscription.slug)} ${subscription.status === "trialing" ? "(Trial)" : ""}`}
                        </p>
                        <button 
                            type="button"
                            onClick={async () => {
                                 if (!currentOrg?._id) return;
                                const { url } = await createCustomerPortalSession.mutateAsync(currentOrg._id);
                                window.location.href = url;
                            }}
                            className="text-primary"
                        >
                            Manage plan &rarr; 
                        </button>
                    </div>
                    <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 border border-mineshaft-600 mr-4">
                        <p className="mb-2 text-gray-400">Price</p>
                        <p className="text-2xl mb-8 text-mineshaft-50 font-semibold">
                            {subscription.status === "trialing" ? "$0.00 / month" : `${formatAmount(data.amount)} / ${data.interval}`}
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
            <ManagePlansModal 
                popUp={popUp}
                handlePopUpToggle={handlePopUpToggle}
            />
        </div>
    );
}