import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from "next-i18next";
import ActivitySideBar from 'ee/components/ActivitySideBar';

import Button from '~/components/basic/buttons/Button';
import EventFilter from '~/components/basic/EventFilter';
import NavHeader from '~/components/navigation/NavHeader';
import { getTranslatedServerSideProps } from '~/components/utilities/withTranslateProps';

import getProjectLogs from '../../ee/api/secrets/GetProjectLogs';
import ActivityTable from '../../ee/components/ActivityTable';


interface logData {
  _id: string;
  channel: string;
  createdAt: string;
  ipAddress: string;
  user: {
    email: string;
  };
  actions: {
    _id: string;
    name: string;
    payload: {
      secretVersions: string[];
    }
  }[]
}

interface PayloadProps {
  _id: string;
  name: string; 
  secretVersions: string[];
}

interface logDataPoint {
  _id: string;
  channel: string;
  createdAt: string;
  ipAddress: string;
  user: string;
  payload: PayloadProps[];
}

/**
 * This is the tab that includes all of the user activity logs
 */
export default function Activity() {
  const router = useRouter();
  const [eventChosen, setEventChosen] = useState('');
  const [logsData, setLogsData] = useState<logDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const currentLimit = 10;
  const [currentSidebarAction, toggleSidebar] = useState<string>()
  const { t } = useTranslation();

  // this use effect updates the data in case of a new filter being added
  useEffect(() => {
    setCurrentOffset(0);
    const getLogData = async () => {
      setIsLoading(true);
      const tempLogsData = await getProjectLogs({ workspaceId: String(router.query.id), offset: 0, limit: currentLimit, userId: "", actionNames: eventChosen })
      setLogsData(tempLogsData.map((log: logData) => {
        return {
          _id: log._id, 
          channel: log.channel, 
          createdAt: log.createdAt, 
          ipAddress: log.ipAddress, 
          user: log.user.email, 
          payload: log.actions.map(action => {
            return {
              _id: action._id,
              name: action.name,
              secretVersions: action.payload.secretVersions
            }
          })
        }
      }))
      setIsLoading(false);
    }
    getLogData();
  }, [eventChosen]);

  // this use effect adds more data in case 'View More' button is clicked
  useEffect(() => {
    const getLogData = async () => {
      setIsLoading(true);
      const tempLogsData = await getProjectLogs({ workspaceId: String(router.query.id), offset: currentOffset, limit: currentLimit, userId: "", actionNames: eventChosen })
      setLogsData(logsData.concat(tempLogsData.map((log: logData) => {
        return {
          _id: log._id, 
          channel: log.channel, 
          createdAt: log.createdAt, 
          ipAddress: log.ipAddress, 
          user: log.user.email, 
          payload: log.actions.map(action => {
            return {
              _id: action._id,
              name: action.name,
              secretVersions: action.payload.secretVersions
            }
          })
        }
      })))
      setIsLoading(false);
    }
    getLogData();
  }, [currentLimit, currentOffset]);

  const loadMoreLogs = () => {
    setCurrentOffset(currentOffset + currentLimit);
  }

  return (
    <div className="mx-6 lg:mx-0 w-full overflow-y-scroll h-screen">
      <NavHeader pageName="Project Activity" isProjectRelated={true} />
      {currentSidebarAction && <ActivitySideBar toggleSidebar={toggleSidebar} currentAction={currentSidebarAction} />}
      <div className="flex flex-col justify-between items-start mx-4 mt-6 mb-4 text-xl max-w-5xl px-2">
        <div className="flex flex-row justify-start items-center text-3xl">
          <p className="font-semibold mr-4 text-bunker-100">{t("activity:title")}</p>
        </div>
        <p className="mr-4 text-base text-gray-400">
          {t("activity:subtitle")}
        </p>
      </div>
      <div className="px-6 h-8 mt-2">
        <EventFilter 
          selected={eventChosen}
          select={setEventChosen}
        />
      </div>
      <ActivityTable
        data={logsData}
        toggleSidebar={toggleSidebar}
        isLoading={isLoading}
      />
      <div className='flex justify-center w-full mb-6'>
        <div className='items-center w-60'>
          <Button text={String(t("common:view-more"))} textDisabled={String(t("common:end-of-history"))} active={logsData.length % 10 == 0 ? true : false} onButtonPressed={loadMoreLogs} size="md" color="mineshaft"/>
        </div>
      </div>
    </div>
  );
}

Activity.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(["activity", "common"]);