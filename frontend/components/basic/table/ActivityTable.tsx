import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  faAngleDown,
  faAngleRight,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import guidGenerator from '../../utilities/randomId';

interface ActivityTableProps {
  eventName: string;
  user: string;
  source: string;
  time: Date;
}

function timeSince(date: Date) {
  const seconds = Math.floor(
    ((new Date() as any) - (date as any)) / 1000
  ) as number;

  let interval = seconds / 31536000;

  if (interval > 1) {
    return Math.floor(interval) + ' years ago';
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return Math.floor(interval) + ' months ago';
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return Math.floor(interval) + ' days ago';
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return Math.floor(interval) + ' hours ago';
  }
  interval = seconds / 60;
  if (interval > 1) {
    return Math.floor(interval) + ' minutes ago';
  }
  return Math.floor(seconds) + ' seconds ago';
}

const ActivityLogsRow = ({ row }: { row: ActivityTableProps }): JSX.Element => {
  const [payloadOpened, setPayloadOpened] = useState(false);
  return (
    <>
      <tr
        key={guidGenerator()}
        className="bg-bunker-800 duration-100 cursor-pointer w-full"
      >
        <div
          onClick={() => setPayloadOpened(!payloadOpened)}
          className="border-mineshaft-700 border-t text-gray-300 flex items-center"
        >
          <FontAwesomeIcon
            icon={payloadOpened ? faAngleDown : faAngleRight}
            className={`mt-3.5 ml-6 text-bunker-100 hover:bg-primary-100/[0.15] ${
              payloadOpened && 'bg-primary-100/10'
            } p-1 duration-100 h-4 w-4 rounded-md`}
          />
        </div>
        <td className="py-3 border-mineshaft-700 border-t text-gray-300">
          {row.eventName}
        </td>
        <td className="pl-6 py-3 border-mineshaft-700 border-t text-gray-300">
          {row.user}
        </td>
        <td className="pl-6 py-3 border-mineshaft-700 border-t text-gray-300">
          {row.source}
        </td>
        <td className="pl-6 py-3 border-mineshaft-700 border-t text-gray-300">
          {timeSince(row.time)}
        </td>
        {/* <td className="py-2 border-mineshaft-700 border-t">
          <div className="opacity-50 hover:opacity-100 duration-200 flex items-center">
            <Button
              onButtonPressed={() => {}}
              color="red"
              size="icon-sm"
              icon={faX}
            />
          </div>
        </td> */}
      </tr>
      {payloadOpened && (
        <tr className="w-full h-10 bg-bunker-700 text-bunker-200 col-span-2">
          <td colSpan={5} className="">
            <div className="flex flex-row ml-12 py-2 border-mineshaft-700 border-t">
              <div className="w-96">Timestamp</div>
              <div className="w-96">2022-12-16T04:02:44.517Z</div>
            </div>
            <div className="flex flex-row ml-12 py-2 border-mineshaft-700 border-t">
              <div className="w-96">Number of Secrets</div>
              <div className="w-96">32</div>
            </div>
            <div className="flex flex-row ml-12 py-2 border-mineshaft-700 border-t">
              <div className="w-96">IP Address</div>
              <div className="w-96">159.223.164.24</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/**
 * This is the table for activity logs (one of the tabs)
 * @param {*} props
 * @returns
 */
const ActivityTable = ({ data }: { data: ActivityTableProps[] }) => {
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
            {data.map((row, index) => {
              return <ActivityLogsRow key={index} row={row} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActivityTable;
