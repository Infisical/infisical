import { Button } from "@app/components/v2";
import { useOrganization,useSubscription  } from "@app/context";
import { 
    useCreateCustomerPortalSession,
    useGetOrgPlanBillingInfo} from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { ManagePlansModal } from "./ManagePlansModal";

export const PreviewSection = () => {
    const { currentOrg } = useOrganization();
    const { subscription, isLoading: isSubscriptionLoading } = useSubscription();
    const { data, isLoading } = useGetOrgPlanBillingInfo(currentOrg?._id ?? "");
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
    
    return (
        <div>
            {!isSubscriptionLoading && subscription?.slug !== "enterprise" && subscription?.slug !== "pro" && subscription?.slug !== "pro-annual" && (
                <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 border border-mineshaft-600 mt-8 flex items-center bg-mineshaft-600 max-w-screen-lg">
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-mineshaft-50">Become Infisical</h2>
                        <p className="text-gray-400 mt-4">Unlimited members, projects, RBAC, smart alerts, and so much more</p>
                    </div>
                    <Button 
                        onClick={() => handlePopUpOpen("managePlan")}
                        color="mineshaft"
                    >
                        Upgrade
                    </Button>
                </div>
            )}
            {!isLoading && data && subscription && (
                <div className="flex mt-8 max-w-screen-lg">
                    <div className="p-4 bg-mineshaft-900 rounded-lg flex-1 mr-4 border border-mineshaft-600">
                        <p className="mb-2 text-gray-400">Current plan</p>
                        <p className="text-2xl mb-8 text-mineshaft-50 font-semibold">
                            {formatPlanSlug(subscription.slug)}
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
                            {`${formatAmount(data.amount)} / ${data.interval}`}
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