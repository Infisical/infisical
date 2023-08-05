import { useForm } from "react-hook-form";
import { LogsFilter } from "./LogsFilter";
import { LogsTable } from "./LogsTable";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { EventType, UserAgentType } from "~/hooks/api/auditLogs/enums";

const schema = yup.object({
    eventType: yup.string()
        .oneOf(Object.values(EventType), 'Invalid event type'),
    actor: yup.string(),
    userAgentType: yup.string()
        .oneOf(Object.values(UserAgentType), 'Invalid user agent type'),
}).required();

export type AuditLogFilterFormData = yup.InferType<typeof schema>;

export const LogsSection = () => {
    const {
        control,
        reset,
        watch,
    } = useForm<AuditLogFilterFormData>({
        resolver: yupResolver(schema)
    });

    const eventType = watch("eventType") as EventType | undefined;
    const userAgentType = watch("userAgentType") as UserAgentType | undefined;
    const actor = watch("actor") as string | undefined;
    
    return (
        <div className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600">
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Audit Logs
                </h2>
            </div>
            <LogsFilter 
                control={control} 
                reset={reset}
            />
            <LogsTable
                eventType={eventType}
                userAgentType={userAgentType}
                actor={actor}
            />
        </div>
    );
}