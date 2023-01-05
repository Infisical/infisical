import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from "next-i18next";
import {
  faAngleDown,
  faAngleRight,
  faUpRightFromSquare
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import timeSince from 'ee/utilities/timeSince';

import guidGenerator from '../../components/utilities/randomId';


interface PayloadProps {
  _id: string;
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
 * This is a single row of the activity table
 * @param obj 
 * @param {logData} obj.row - data for a certain event
 * @param {function} obj.toggleSidebar - open and close sidebar that displays data for a specific event
 * @returns 
 */
const ActivityLogsRow = ({ row, toggleSidebar }: { row: logData, toggleSidebar: (value: string) => void; }) => {
  const [payloadOpened, setPayloadOpened] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <tr key={guidGenerator()} className="bg-bunker-800 duration-100 w-full text-sm">
        <td
          onClick={() => setPayloadOpened(!payloadOpened)}
          className="border-mineshaft-700 border-t text-gray-300 flex items-center cursor-pointer"
        >
          <FontAwesomeIcon
            icon={payloadOpened ? faAngleDown : faAngleRight}
            className={`mt-2.5 ml-6 text-bunker-100 hover:bg-mineshaft-700 ${
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
      <tr className='h-9 text-bunker-200 border-mineshaft-700 border-t text-sm'>
        <td></td>
        <td>Timestamp</td>
        <td>{row.createdAt}</td>
      </tr>}
      {payloadOpened &&
      row.payload?.map((action, index) => 
      <tr key={index} className="h-9 text-bunker-200 border-mineshaft-700 border-t text-sm">
        <td></td>
        <td className="">{t("activity:event." + action.name)}</td>
        <td className="text-primary-300 cursor-pointer hover:text-primary duration-200" onClick={() => toggleSidebar(action._id)}>
          {action.secretVersions.length + (action.secretVersions.length != 1 ? " secrets" : " secret")}
          <FontAwesomeIcon icon={faUpRightFromSquare} className="ml-2 mb-0.5 font-light w-3 h-3"/>
        </td>
      </tr>)}
      {payloadOpened &&
      <tr className='h-9 text-bunker-200 border-mineshaft-700 border-t text-sm'>
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
 * @returns
 */
const ActivityTable = ({ data, toggleSidebar }: { data: logData[], toggleSidebar: (value: string) => void; }) => {
  return (
    <div className="w-full px-6 mt-8">
      <div className="table-container w-full bg-bunker rounded-md mb-6 border border-mineshaft-700 relative">
        <div className="absolute rounded-t-md w-full h-[3rem] bg-white/5"></div>
        <table className="w-full my-1">
          <thead className="text-bunker-300">
            <tr className='text-sm'>
              <th className="text-left pl-6 pt-2.5 pb-3"></th>
              <th className="text-left font-semibold pt-2.5 pb-3">EVENT</th>
              <th className="text-left font-semibold pl-6 pt-2.5 pb-3">USER</th>
              <th className="text-left font-semibold pl-6 pt-2.5 pb-3">SOURCE</th>
              <th className="text-left font-semibold pl-6 pt-2.5 pb-3">TIME</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((row, index) => {
              return <ActivityLogsRow key={index} row={row} toggleSidebar={toggleSidebar} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActivityTable;
