import React from 'react';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SecretDataProps } from 'public/data/frequentInterfaces';

import DashboardInputField from './DashboardInputField';

interface KeyPairProps {
  keyPair: SecretDataProps;
  modifyKey: (value: string, position: number) => void; 
  modifyValue: (value: string, position: number) => void; 
  modifyValueOverride: (value: string, position: number) => void; 
  isBlurred: boolean;
  isDuplicate: boolean;
  toggleSidebar: (id: string) => void;
  sidebarSecretId: string;
  isSnapshot: boolean;
}

/**
 * This component represent a single row for an environemnt variable on the dashboard
 * @param {object} obj
 * @param {String[]} obj.keyPair - data related to the environment variable (id, pos, key, value, public/private)
 * @param {function} obj.modifyKey - modify the key of a certain environment variable
 * @param {function} obj.modifyValue - modify the value of a certain environment variable
 * @param {function} obj.modifyValueOverride - modify the value of a certain environment variable if it is overriden
 * @param {boolean} obj.isBlurred - if the blurring setting is turned on
 * @param {boolean} obj.isDuplicate - list of all the duplicates secret names on the dashboard
 * @param {function} obj.toggleSidebar - open/close/switch sidebar
 * @param {string} obj.sidebarSecretId - the id of a secret for the side bar is displayed
 * @param {boolean} obj.isSnapshot - whether this keyPair is in a snapshot. If so, it won't have some features like sidebar 
 * @returns
 */
const KeyPair = ({
  keyPair,
  modifyKey,
  modifyValue,
  modifyValueOverride,
  isBlurred,
  isDuplicate,
  toggleSidebar,
  sidebarSecretId,
  isSnapshot
}: KeyPairProps) => {
  return (
    <div className={`mx-1 flex flex-col items-center ml-1 ${isSnapshot && "pointer-events-none"} ${keyPair.id == sidebarSecretId && "bg-mineshaft-500 duration-200"} rounded-md`}>
      <div className="relative flex flex-row justify-between w-full max-w-5xl mr-auto max-h-14 my-1 items-start px-1">
      {keyPair.valueOverride && <div className="group font-normal group absolute top-[1rem] left-[0.2rem] z-40 inline-block text-gray-300 underline hover:text-primary duration-200">
        <div className='w-1 h-1 rounded-full bg-primary z-40'></div>
        <span className="absolute z-50 hidden group-hover:flex group-hover:animate-popdown duration-200 w-[10.5rem] -left-[0.4rem] -top-[1.7rem] translate-y-full px-2 py-2 bg-mineshaft-500 rounded-b-md rounded-r-md text-center text-gray-100 text-sm after:content-[''] after:absolute after:left-0 after:bottom-[100%] after:-translate-x-0 after:border-8 after:border-x-transparent after:border-t-transparent after:border-b-mineshaft-500">
          This secret is overriden
        </span>
      </div>}
        <div className="min-w-xl w-96">
          <div className="flex pr-1.5 items-center rounded-lg mt-4 md:mt-0 max-h-16">
            <DashboardInputField
              onChangeHandler={modifyKey}
              type="varName"
              position={keyPair.pos}
              value={keyPair.key}
              isDuplicate={isDuplicate}
            />
          </div>
        </div>
        <div className="w-full min-w-xl">
          <div className={`flex min-w-xl items-center ${!isSnapshot && "pr-1.5"} rounded-lg mt-4 md:mt-0 max-h-10`}>
            <DashboardInputField
              onChangeHandler={keyPair.valueOverride ? modifyValueOverride : modifyValue}
              type="value"
              position={keyPair.pos}
              value={keyPair.valueOverride ? keyPair.valueOverride : keyPair.value}
              blurred={isBlurred}
              override={Boolean(keyPair.valueOverride)}
            />
          </div>
        </div>
        {!isSnapshot && <div onClick={() => toggleSidebar(keyPair.id)} className="cursor-pointer w-[2.35rem] h-[2.35rem] bg-mineshaft-700 hover:bg-chicago-700 rounded-md flex flex-row justify-center items-center duration-200">
          <FontAwesomeIcon
            className="text-gray-300 px-2.5 text-lg mt-0.5"
            icon={faEllipsis}
          />
        </div>}
      </div>
    </div>
  );
};

export default KeyPair;