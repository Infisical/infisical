import { Control, Controller, UseFormReset } from "react-hook-form";
import { faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    Button,
    FormControl,
    Select,
    SelectItem} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetAuditLogActorFilterOpts } from "@app/hooks/api";

import { eventToNameMap, userAgentTTypeoNameMap } from "~/hooks/api/auditLogs/constants";
import { ActorType } from "~/hooks/api/auditLogs/enums";
import { Actor } from "~/hooks/api/auditLogs/types";

import { AuditLogFilterFormData } from "./types";

const eventTypes = Object.entries(eventToNameMap).map(([value, label]) => ({ label, value }));
const userAgentTypes = Object.entries(userAgentTTypeoNameMap).map(([value, label]) => ({ label, value }));

type Props = {
    control: Control<AuditLogFilterFormData>;
    reset: UseFormReset<AuditLogFilterFormData>;
}

export const LogsFilter = ({
    control,
    reset
}: Props) => {
    const { currentWorkspace } = useWorkspace();
    const { data, isLoading } = useGetAuditLogActorFilterOpts(currentWorkspace?._id ?? "");
    
    const renderActorSelectItem = (actor: Actor) => {
        switch (actor.type) {
            case ActorType.USER:
                return (
                    <SelectItem value={`${actor.type}-${actor.metadata.userId}`} key={`user-actor-filter-${actor.metadata.userId}`}>
                        {actor.metadata.email}
                    </SelectItem>
                );
            case ActorType.SERVICE:
                return (
                    <SelectItem value={`${actor.type}-${actor.metadata.serviceId}`} key={`service-actor-filter-${actor.metadata.serviceId}`}>
                        {actor.metadata.name}
                    </SelectItem>
                );
            default:
                return (
                    <SelectItem value="actor-none" key="actor-none">
                        N/A
                    </SelectItem>
                );
        }

    }

    return (
        <div className="flex justify-between items-center">
            <div className="flex items-center">
                <div className="w-40 mr-4">
                    <Controller
                        control={control}
                        name="eventType"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                            <FormControl
                                label="Event"
                                errorText={error?.message}
                                isError={Boolean(error)}
                            >
                                <Select
                                    defaultValue={field.value}
                                    {...field}
                                    onValueChange={(e) => onChange(e)}
                                    className="w-full"
                                >
                                    {eventTypes.map(({ label, value }) => (
                                        <SelectItem value={String(value || "")} key={label}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    />
                </div>
                {!isLoading && data && data.length > 0 && (
                    <div className="w-40 mr-4">
                        <Controller
                            control={control}
                            name="actor"
                            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                                <FormControl
                                    label="Actor"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <Select
                                        defaultValue={field.value}
                                        {...field}
                                        onValueChange={(e) => onChange(e)}
                                        className="w-full"
                                    >
                                        {data.map((actor) => renderActorSelectItem(actor))}
                                    </Select>
                                </FormControl>
                            )}
                        />
                    </div>
                )}
                <div className="w-40">
                    <Controller
                        control={control}
                        name="userAgentType"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                            <FormControl
                                label="Source"
                                errorText={error?.message}
                                isError={Boolean(error)}
                            >
                                <Select
                                    defaultValue={field.value}
                                    {...field}
                                    onValueChange={(e) => onChange(e)}
                                    className="w-full"
                                >
                                    {userAgentTypes.map(({ label, value }) => (
                                        <SelectItem value={String(value || "")} key={label}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    />
                </div>
            </div>
            <div>
                <Button
                    isLoading={false}
                    colorSchema="primary"
                    variant="outline_bg"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faFilterCircleXmark} className="mr-2" />}
                    onClick={() => reset({
                        eventType: "",
                        actor: "",
                        userAgentType: ""
                    })}
                >
                    Clear filters
                </Button>
            </div>
        </div>
    );
}
