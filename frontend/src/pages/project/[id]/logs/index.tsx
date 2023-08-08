import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import { useRouter } from "next/router";

import Button from "@app/components/basic/buttons/Button";
import EventFilter from "@app/components/basic/EventFilter";
import { UpgradePlanModal } from "@app/components/v2";
import { useSubscription } from "@app/context";
import ActivitySideBar from "@app/ee/components/ActivitySideBar";
import { usePopUp } from "@app/hooks/usePopUp";

import getProjectLogs from "../../../../ee/api/secrets/GetProjectLogs";
import ActivityTable from "../../../../ee/components/ActivityTable";

interface LogData {
  _id: string;
  channel: string;
  createdAt: string;
  ipAddress: string;
  user: {
    email: string;
  };
  serviceAccount?: {
    string: string;
  },
  serviceTokenData?: {
    name: string;
  }
  actions: {
    _id: string;
    name: string;
    payload: {
      secretVersions: string[];
    };
  }[];
}

interface PayloadProps {
  _id: string;
  name: string;
  secretVersions: string[];
}

interface LogDataPoint {
  _id: string;
  channel: string;
  createdAt: string;
  ipAddress: string;
  user: string;
  serviceAccount: {
    name: string;
  };
  serviceTokenData: {
    name: string;
  };
  payload: PayloadProps[];
}

/**
 * This is the tab that includes all of the user activity logs
 */
export default function Activity() {
  const router = useRouter();
  const [eventChosen, setEventChosen] = useState("");
  const [logsData, setLogsData] = useState<LogDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const currentLimit = 10;
  const [currentSidebarAction, toggleSidebar] = useState<string>();
  const { t } = useTranslation();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "upgradePlan"
  ] as const);

  // this use effect updates the data in case of a new filter being added
  useEffect(() => {
    setCurrentOffset(0);
    const getLogData = async () => {
      setIsLoading(true);
      const tempLogsData = await getProjectLogs({
        workspaceId: String(router.query.id),
        offset: 0,
        limit: currentLimit,
        userId: "",
        actionNames: eventChosen
      });

      setLogsData(
        tempLogsData.map((log: LogData) => ({
          _id: log._id,
          channel: log.channel,
          createdAt: log.createdAt,
          ipAddress: log.ipAddress,
          user: log?.user?.email,
          serviceAccount: log?.serviceAccount,
          serviceTokenData: log?.serviceTokenData,
          payload: log.actions.map((action) => ({
            _id: action._id,
            name: action.name,
            secretVersions: action.payload.secretVersions
          }))
        }))
      );
      setIsLoading(false);
    };
    getLogData();
  }, [eventChosen]);

  // this use effect adds more data in case 'View More' button is clicked
  useEffect(() => {
    const getLogData = async () => {
      setIsLoading(true);
      const tempLogsData = await getProjectLogs({
        workspaceId: String(router.query.id),
        offset: currentOffset,
        limit: currentLimit,
        userId: "",
        actionNames: eventChosen
      });
      setLogsData(
        logsData.concat(
          tempLogsData.map((log: LogData) => ({
            _id: log._id,
            channel: log.channel,
            createdAt: log.createdAt,
            ipAddress: log.ipAddress,
            user: log?.user?.email,
            serviceAccount: log?.serviceAccount,
            serviceTokenData: log?.serviceTokenData,
            payload: log.actions.map((action) => ({
              _id: action._id,
              name: action.name,
              secretVersions: action.payload.secretVersions
            }))
          }))
        )
      );
      setIsLoading(false);
    };
    getLogData();
  }, [currentLimit, currentOffset]);

  const loadMoreLogs = () => {
    if (subscription?.auditLogs === false) {
      handlePopUpOpen("upgradePlan");
    } else {
      setCurrentOffset(currentOffset + currentLimit);
    }
  };

  return (
    <div className="mx-auto w-full h-full max-w-7xl">
      <Head>
        <title>Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      {currentSidebarAction && (
        <ActivitySideBar toggleSidebar={toggleSidebar} currentAction={currentSidebarAction} />
      )}
      <div className="flex flex-col justify-between items-start mx-4 mb-4 text-xl px-2">
        <div className="flex flex-row justify-start items-center text-3xl mt-6">
          <p className="font-semibold mr-4 text-bunker-100">{t("activity.title")}</p>
        </div>
        <p className="mr-4 text-base text-gray-400">{t("activity.subtitle")}</p>
      </div>
      <div className="px-6 h-8 mt-2">
        <EventFilter selected={eventChosen} select={setEventChosen} />
      </div>
      <ActivityTable data={logsData} toggleSidebar={toggleSidebar} isLoading={isLoading} />
      <div className="flex justify-center w-full mb-6">
        <div className="items-center w-60">
          <Button
            text={String(t("common.view-more"))}
            textDisabled={String(t("common.end-of-history"))}
            active={logsData.length % 10 === 0}
            onButtonPressed={loadMoreLogs}
            size="md"
            color="mineshaft"
          />
        </div>
      </div>
      {subscription && (
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={() => handlePopUpClose("upgradePlan")}
          text={subscription.slug === null ? "You can see more logs under an Enterprise license" : "You can see more logs if you switch to Infisical's Business/Professional Plan."}
        />
      )}
    </div>
  );
}

Activity.requireAuth = true;

