import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from "next-i18next";
import {
  faAngleDown,
  faAngleRight,
  faUpRightFromSquare,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import timeSince from 'ee/utilities/timeSince';

import guidGenerator from '../../components/utilities/randomId';


interface PayloadProps {
  name: string; 
  secretVersions: string[];
}

interface logData {
  _id: string;
  channel: string;
  createdAt: string;
  ipAddress: string;
  user: string;
  payload: PayloadProps[];
}


/**
 * 
 * @param obj 
 * @param {function} obj.setCurrentEvent - specify the name of the event for which the sidebar is being opened
 * @returns 
 */
const ActivityLogsRow = ({ row, toggleSidebar, setCurrentEvent }: { row: logData, toggleSidebar: (value: string[]) => void; setCurrentEvent: (value: string) => void; }) => {
  const [payloadOpened, setPayloadOpened] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <tr key={guidGenerator()} className="bg-bunker-800 duration-100 w-full">
        <td
          onClick={() => setPayloadOpened(!payloadOpened)}
          className="border-mineshaft-700 border-t text-gray-300 flex items-center cursor-pointer"
        >
          <FontAwesomeIcon
            icon={payloadOpened ? faAngleDown : faAngleRight}
            className={`mt-3 ml-6 text-bunker-100 hover:bg-mineshaft-700 ${
              payloadOpened && 'bg-mineshaft-500'
            } p-1 duration-100 h-4 w-4 rounded-md`}
          />
        </td>
        <td className="py-3 border-mineshaft-700 border-t text-gray-300">
          {row.payload?.map(action => String(action.secretVersions.length) + " " + t("activity:event." + action.name)).join(" and ")}
        </td>
        <td className="pl-6 py-3 border-mineshaft-700 border-t text-gray-300">
          {row.user}
        </td>
        <td className="pl-6 py-3 border-mineshaft-700 border-t text-gray-300">
          {row.channel}
        </td>
        <td className="pl-6 py-3 border-mineshaft-700 border-t text-gray-300">
          {timeSince(new Date(row.createdAt))}
        </td>
      </tr>
      {payloadOpened &&
      <tr className='h-9 text-bunker-200 border-mineshaft-700 border-t'>
        <td></td>
        <td>Timestamp</td>
        <td>{row.createdAt}</td>
      </tr>}
      {payloadOpened &&
      row.payload?.map((action, index) => 
      <tr key={index} className="h-9 text-bunker-200 border-mineshaft-700 border-t">
        <td></td>
        <td className="">{t("activity:event." + action.name)}</td>
        <td className="text-primary-300 cursor-pointer hover:text-primary duration-200" onClick={() => {
          toggleSidebar(action.secretVersions);
          setCurrentEvent(action.name);
        }}>
          {action.secretVersions.length + (action.secretVersions.length != 1 ? " secrets" : " secret")}
          <FontAwesomeIcon icon={faUpRightFromSquare} className="ml-2 mb-0.5 font-light w-3 h-3"/>
        </td>
      </tr>)}
      {payloadOpened &&
      <tr className='h-9 text-bunker-200 border-mineshaft-700 border-t'>
        <td></td>
        <td>IP Address</td>
        <td>{row.ipAddress}</td>
      </tr>}
    </>
  );
};

/**
 * This is the table for activity logs (one of the tabs)
 * @param {object} obj
 * @param {logData} obj.data - data for user activity logs
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {function} obj.setCurrentEvent - specify the name of the event for which the sidebar is being opened
 * @returns
 */
const ActivityTable = ({ data, toggleSidebar, setCurrentEvent }: { data: logData[], toggleSidebar: (value: string[]) => void; setCurrentEvent: (value: string) => void; }) => {
  return (
    <div className="w-full px-6 mt-8">
      <div className="table-container w-full bg-bunker rounded-md mb-6 border border-mineshaft-700 relative">
        <div className="absolute rounded-t-md w-full h-[3.15rem] bg-white/5"></div>
        <table className="w-full my-1">
          <thead className="text-bunker-300">
            <tr>
              <th className="text-left pl-6 pt-2.5 pb-3"></th>
              <th className="text-left pt-2.5 pb-3">Event</th>
              <th className="text-left pl-6 pt-2.5 pb-3">User</th>
              <th className="text-left pl-6 pt-2.5 pb-3">Source</th>
              <th className="text-left pl-6 pt-2.5 pb-3">Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row, index) => {
              return <ActivityLogsRow key={index} row={row} toggleSidebar={toggleSidebar} setCurrentEvent={setCurrentEvent} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActivityTable;
