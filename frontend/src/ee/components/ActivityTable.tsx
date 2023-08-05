// TODO: deprecate in favor of new audit logs

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { faAngleDown, faAngleRight, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import timeSince from "@app/ee/utilities/timeSince";

import guidGenerator from "../../components/utilities/randomId";

interface PayloadProps {
  _id: string;
  name: string;
  secretVersions: string[];
}

interface LogData {
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
 * This is a single row of the activity table
 * @param obj
 * @param {LogData} obj.row - data for a certain event
 * @param {function} obj.toggleSidebar - open and close sidebar that displays data for a specific event
 * @returns
 */
const ActivityLogsRow = ({
  row,
  toggleSidebar
}: {
  row: LogData;
  toggleSidebar: (value: string) => void;
}) => {
  const [payloadOpened, setPayloadOpened] = useState(false);
  const { t } = useTranslation();

  const renderUser = () => {
    
    if (row?.user) return `${row.user}`;
    if (row?.serviceAccount) return `Service Account: ${row.serviceAccount.name}`;
    if (row?.serviceTokenData?.name) return `Service Token: ${row.serviceTokenData.name}`;

    return "";
  };
  return (
    <>
      <div key={guidGenerator()} className="w-full bg-mineshaft-800 text-sm text-mineshaft-200 duration-100 flex flex-row items-center">
        <button
          type="button"
          onClick={() => setPayloadOpened(!payloadOpened)}
          className="border-t border-mineshaft-700 pt-[0.58rem]"
        >
          <FontAwesomeIcon
            icon={payloadOpened ? faAngleDown : faAngleRight}
            className={`ml-6 mb-2 text-mineshaft-300 cursor-pointer ${
              payloadOpened ? "bg-mineshaft-500 hover:bg-mineshaft-500" : "hover:bg-mineshaft-700"
            } h-4 w-4 rounded-md p-1 duration-100`}
          />
        </button>
        <div className="border-t border-mineshaft-700 py-3 w-1/4 pl-6">
          {row.payload
            ?.map(
              (action) =>
                `${String(action.secretVersions.length)} ${t(`activity.event.${action.name}`)}`
            )
            .join(" and ")}
        </div>
        <div className="border-t border-mineshaft-700 py-3 pl-6 w-1/4">{renderUser()}</div>
        <div className="border-t border-mineshaft-700 py-3 pl-6 w-1/4">{row.channel}</div>
        <div className="border-t border-mineshaft-700 py-3 pl-6 w-1/4">
          {timeSince(new Date(row.createdAt))}
        </div>
      </div>
      {payloadOpened && (
        <div className="h-9 border-t border-mineshaft-700 text-sm text-bunker-200 bg-mineshaft-900/50 w-full flex flex-row items-center">
          <div className='max-w-xl w-full flex flex-row items-center'>
            <div className='w-24' />
            <div className='w-1/2'>{String(t("common.timestamp"))}</div>
            <div className='w-1/2'>{row.createdAt}</div>
          </div>
        </div>
      )}
      {payloadOpened &&
        row.payload?.map(
          (action) =>
            action.secretVersions.length > 0 && (
              <div 
                key={action.name}
                className="h-9 border-t border-mineshaft-700 text-sm text-bunker-200 bg-mineshaft-900/50 w-full flex flex-row items-center"
              >
                <div className='max-w-xl w-full flex flex-row items-center'>
                  <div className='w-24' />
                  <div className='w-1/2'>{t(`activity.event.${action.name}`)}</div>
                  <button 
                    type="button"
                    onClick={() => toggleSidebar(action._id)}
                    className='w-1/2 text-primary-300 hover:text-primary-500 flex flex-row justify-left items-center duration-100'
                  >
                    {action.secretVersions.length +
                        (action.secretVersions.length !== 1 ? " secrets" : " secret")}
                      <FontAwesomeIcon
                        icon={faUpRightFromSquare}
                        className="ml-2 mb-0.5 h-3 w-3 font-light"
                      />
                  </button>
                </div>
              </div>
            )
        )}
      {payloadOpened && (
        <div className="h-9 border-t border-mineshaft-700 text-sm text-bunker-200 bg-mineshaft-900/50 w-full flex flex-row items-center">
          <div className='max-w-xl w-full flex flex-row items-center'>
            <div className='w-24' />
            <div className='w-1/2'>{String(t("activity.ip-address"))}</div>
            <div className='w-1/2'>{row.ipAddress}</div>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * This is the table for activity logs (one of the tabs)
 * @param {object} obj
 * @param {logData} obj.data - data for user activity logs
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {boolean} obj.isLoading - whether the log data has been loaded yet or not
 * @returns
 */
const ActivityTable = ({
  data,
  toggleSidebar,
  isLoading
}: {
  data: LogData[];
  toggleSidebar: (value: string) => void;
  isLoading: boolean;
}) => {
  const { t } = useTranslation();

  return (
    <div className="mt-8 w-full px-6">
      <div className="table-container relative mb-6 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800">
        {/* <div className="absolute h-[3rem] w-full rounded-t-md bg-white/5" /> */}
        <div className="my-1 w-full">
          <div className="text-bunker-300 border-b border-mineshaft-600">
            <div className="text-sm flex flex-row w-full">
              <button
                type="button"
                onClick={() => {}}
                className="opacity-0"
              >
                <FontAwesomeIcon
                  icon={faAngleRight}
                  className="ml-6 mb-2 text-bunker-100 hover:bg-mineshaft-700 cursor-pointer h-4 w-4 rounded-md p-1 duration-100"
                />
              </button>
              <div className="flex flex-row justify-between w-full">
                <div className="pt-2.5 pb-3 text-left font-semibold w-1/4 pl-6">
                  {String(t("common.event")).toUpperCase()}
                </div>
                <div className="pl-6 pt-2.5 pb-3 text-left font-semibold w-1/4 pl-6">
                  {String(t("common.user")).toUpperCase()}
                </div>
                <div className="pl-6 pt-2.5 pb-3 text-left font-semibold w-1/4 pl-6">
                  {String(t("common.source")).toUpperCase()}
                </div>
                <div className="pl-6 pt-2.5 pb-3 text-left font-semibold w-1/4 pl-6">
                  {String(t("common.time")).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
          {data?.map((row, index) => (
            <ActivityLogsRow
              key={`activity.${index + 1}.${row._id}`}
              row={row}
              toggleSidebar={toggleSidebar}
            />
          ))}
        </div>
      </div>
      {isLoading && (
        <div className="mb-8 mt-4 bg-mineshaft-800 rounded-md h-60 flex w-full justify-center animate-pulse" />
      )}
    </div>
  );
};

export default ActivityTable;
