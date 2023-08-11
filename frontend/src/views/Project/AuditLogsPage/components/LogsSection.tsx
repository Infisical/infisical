import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";

import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";

import { LogsFilter } from "./LogsFilter";
import { LogsTable } from "./LogsTable";
import { AuditLogFilterFormData, auditLogFilterFormSchema } from "./types";

export const LogsSection = () => {
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
        </div>
    );
 }