/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';
import { faAngleDown, faAngleRight, faUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import timeSince from '@app/ee/utilities/timeSince';

import guidGenerator from '../../components/utilities/randomId';

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
    if (row?.user) return `User: ${row.user}`;
    if (row?.serviceAccount) return `Service Account: ${row.serviceAccount.name}`;
    if (row?.serviceTokenData.name) return `Service Token: ${row.serviceTokenData.name}`;

    return '';
  };
  return (
    <>
      <tr key={guidGenerator()} className="w-full bg-bunker-800 text-sm duration-100">
        <td
          onKeyDown={() => null}
          onClick={() => setPayloadOpened(!payloadOpened)}
          className="flex cursor-pointer items-center border-t border-mineshaft-700 text-gray-300"
        >
          <FontAwesomeIcon
            icon={payloadOpened ? faAngleDown : faAngleRight}
            className={`mt-2.5 ml-6 text-bunker-100 hover:bg-mineshaft-700 ${
              payloadOpened && 'bg-mineshaft-500'
            } h-4 w-4 rounded-md p-1 duration-100`}
          />
        </td>
        <td className="border-t border-mineshaft-700 py-3 text-gray-300">
          {row.payload
            ?.map(
              (action) =>
                `${String(action.secretVersions.length)} ${t(`activity.event.${action.name}`)}`
            )
            .join(' and ')}
        </td>
        <td className="border-t border-mineshaft-700 py-3 pl-6 text-gray-300">{renderUser()}</td>
        <td className="border-t border-mineshaft-700 py-3 pl-6 text-gray-300">{row.channel}</td>
        <td className="border-t border-mineshaft-700 py-3 pl-6 text-gray-300">
          {timeSince(new Date(row.createdAt))}
        </td>
      </tr>
      {payloadOpened && (
        <tr className="h-9 border-t border-mineshaft-700 text-sm text-bunker-200">
          <td />
          <td>{String(t('common.timestamp'))}</td>
          <td>{row.createdAt}</td>
        </tr>
      )}
      {payloadOpened &&
        row.payload?.map(
          (action) =>
            action.secretVersions.length > 0 && (
              <tr
                key={action._id}
                className="h-9 border-t border-mineshaft-700 text-sm text-bunker-200"
              >
                <td />
                <td className="">{t(`activity.event.${action.name}`)}</td>
                <td
                  onKeyDown={() => null}
                  className="cursor-pointer text-primary-300 duration-200 hover:text-primary"
                  onClick={() => toggleSidebar(action._id)}
                >
                  {action.secretVersions.length +
                    (action.secretVersions.length !== 1 ? ' secrets' : ' secret')}
                  <FontAwesomeIcon
                    icon={faUpRightFromSquare}
                    className="ml-2 mb-0.5 h-3 w-3 font-light"
                  />
                </td>
              </tr>
            )
        )}
      {payloadOpened && (
        <tr className="h-9 border-t border-mineshaft-700 text-sm text-bunker-200">
          <td />
          <td>{String(t('activity.ip-address'))}</td>
          <td>{row.ipAddress}</td>
        </tr>
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
      <div className="table-container relative mb-6 w-full rounded-md border border-mineshaft-700 bg-bunker">
        <div className="absolute h-[3rem] w-full rounded-t-md bg-white/5" />
        <table className="my-1 w-full">
          <thead className="text-bunker-300">
            <tr className="text-sm">
              <th aria-label="actions" className="pl-6 pt-2.5 pb-3 text-left" />
              <th className="pt-2.5 pb-3 text-left font-semibold">
                {String(t('common.event')).toUpperCase()}
              </th>
              <th className="pl-6 pt-2.5 pb-3 text-left font-semibold">
                {String(t('common.user')).toUpperCase()}
              </th>
              <th className="pl-6 pt-2.5 pb-3 text-left font-semibold">
                {String(t('common.source')).toUpperCase()}
              </th>
              <th className="pl-6 pt-2.5 pb-3 text-left font-semibold">
                {String(t('common.time')).toUpperCase()}
              </th>
              <th aria-label="action" />
            </tr>
          </thead>
          <tbody>
            {data?.map((row, index) => (
              <ActivityLogsRow
                key={`activity.${index + 1}.${row._id}`}
                row={row}
                toggleSidebar={toggleSidebar}
              />
            ))}
          </tbody>
        </table>
      </div>
      {isLoading && (
        <div className="mb-8 mt-4 flex w-full justify-center">
          <Image
            src="/images/loading/loading.gif"
            height={60}
            width={100}
            alt="loading animation"
          />
        </div>
      )}
    </div>
  );
};

export default ActivityTable;
