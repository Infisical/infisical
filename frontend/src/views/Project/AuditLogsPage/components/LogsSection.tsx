import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { yupResolver } from "@hookform/resolvers/yup";

import { UpgradePlanModal } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import { usePopUp } from "@app/hooks/usePopUp";

import { LogsFilter } from "./LogsFilter";
import { LogsTable } from "./LogsTable";
import { AuditLogFilterFormData, auditLogFilterFormSchema } from "./types";

export const LogsSection = () => {
    const { subscription } = useSubscription();
    const router = useRouter();
    
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
        "upgradePlan"
    ] as const);
    
    const {
        control,
        reset,
        watch,
        setValue,
    } = useForm<AuditLogFilterFormData>({
        resolver: yupResolver(auditLogFilterFormSchema),
        defaultValues: {
            page: 1,
            perPage: 10
        }
    });
    
    useEffect(() => {
        if (subscription && !subscription.auditLogs) {
            handlePopUpOpen("upgradePlan");
        }
    }, [subscription]);

    const eventType = watch("eventType") as EventType | undefined;
    const userAgentType = watch("userAgentType") as UserAgentType | undefined;
    const actor = watch("actor");

    const startDate = watch("startDate");
    const endDate = watch("endDate");

    const page = watch("page") as number;
    const perPage = watch("perPage") as number;
    
    return (
        <div 
            // className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600"
        >
            {/* <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Audit Logs
                </h2>
            </div> */}
            <LogsFilter 
                control={control} 
                reset={reset}
            />
            <LogsTable
                eventType={eventType}
                userAgentType={userAgentType}
                actor={actor}
                startDate={startDate}
                endDate={endDate}
                page={page}
                perPage={perPage}
                setValue={setValue}
            />
            <UpgradePlanModal
                isOpen={popUp.upgradePlan.isOpen}
                onOpenChange={(isOpen) => {
                    
                    if (!isOpen) {
                        router.back();
                        return;
                    }

                    handlePopUpToggle("upgradePlan", isOpen)
                }}
                text="You can use audit logs if you switch to a paid Infisical plan."
            />
        </div>
    );
 }