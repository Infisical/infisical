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

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const defaultPage = 1;
  const defaultPerPage = 10;
  const { control, reset, watch, setValue } = useForm<AuditLogFilterFormData>({
    resolver: yupResolver(auditLogFilterFormSchema),
    defaultValues: {
      page: defaultPage,
      perPage: defaultPerPage
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

  /**
   * There was a bug where the offset number was Nan and the limit was undefined. So I added a defaultPage and defaultPerPage.
   */
  const page = (watch("page") as number) ?? defaultPage;
  const perPage = (watch("perPage") as number) ?? defaultPerPage;

  return (
    <>
      <LogsFilter control={control} reset={reset} />
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

          handlePopUpToggle("upgradePlan", isOpen);
        }}
        text="You can use audit logs if you switch to a paid Infisical plan."
      />
    </>
  );
};
