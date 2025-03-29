import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { useDebounce } from "@app/hooks";
import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import { usePopUp } from "@app/hooks/usePopUp";

import { LogsFilter } from "./LogsFilter";
import { LogsTable } from "./LogsTable";
import { AuditLogFilterFormData, auditLogFilterFormSchema, Presets } from "./types";

type Props = {
  presets?: Presets;
  refetchInterval?: number;
  showFilters?: boolean;
};

export const LogsSection = withPermission(
  ({ presets, refetchInterval, showFilters = true }: Props) => {
    const { subscription } = useSubscription();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

    const { control, reset, watch, getFieldState, resetField, setValue } =
      useForm<AuditLogFilterFormData>({
        resolver: zodResolver(auditLogFilterFormSchema),
        defaultValues: {
          project: null,
          environment: undefined,
          secretKey: "",
          secretPath: "",
          actor: presets?.actorId,
          eventType: presets?.eventType || [],
          userAgentType: undefined,
          startDate: presets?.startDate ?? new Date(new Date().setDate(new Date().getDate() - 1)),
          endDate: presets?.endDate ?? new Date(new Date(Date.now()).setHours(23, 59, 59, 999))
        }
      });

    useEffect(() => {
      if (subscription && !subscription.auditLogs) {
        handlePopUpOpen("upgradePlan");
      }
    }, [subscription]);

    const eventType = watch("eventType") as EventType[] | undefined;
    const userAgentType = watch("userAgentType") as UserAgentType | undefined;
    const actor = watch("actor");
    const projectId = watch("project")?.id;
    const environment = watch("environment")?.slug;
    const secretPath = watch("secretPath");
    const secretKey = watch("secretKey");

    const startDate = watch("startDate");
    const endDate = watch("endDate");

    const [debouncedSecretPath] = useDebounce<string>(secretPath!, 500);
    const [debouncedSecretKey] = useDebounce<string>(secretKey!, 500);

    return (
      <div className="space-y-2">
        <div className="flex w-full justify-end">
          {showFilters && (
            <LogsFilter
              presets={presets}
              control={control}
              watch={watch}
              reset={reset}
              resetField={resetField}
              getFieldState={getFieldState}
              setValue={setValue}
            />
          )}
        </div>

        <LogsTable
          refetchInterval={refetchInterval}
          filter={{
            secretPath: debouncedSecretPath || undefined,
            secretKey: debouncedSecretKey || undefined,
            eventMetadata: presets?.eventMetadata,
            projectId,
            actorType: presets?.actorType,
            limit: 15,
            eventType,
            userAgentType,
            startDate,
            endDate,
            environment,
            actor
          }}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("upgradePlan", isOpen);
          }}
          text="You can use audit logs if you switch to a paid Infisical plan."
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.AuditLogs }
);
