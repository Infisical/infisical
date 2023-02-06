import { faEllipsis } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SecretDataProps } from 'public/data/frequentInterfaces';

import DashboardInputField from './DashboardInputField';
import { DeleteActionButton } from './DeleteActionButton';

interface KeyPairProps {
  keyPair: SecretDataProps;
  modifyKey: (value: string, position: number) => void;
  modifyValue: (value: string, position: number) => void;
  modifyValueOverride: (value: string | undefined, position: number) => void;
  modifyComment: (value: string, position: number) => void;
  isBlurred: boolean;
  isDuplicate: boolean;
  toggleSidebar: (id: string) => void;
  sidebarSecretId: string;
  isSnapshot: boolean;
  isCapitalized: boolean;
  deleteRow?: (props: DeleteRowFunctionProps) => void;
}

export interface DeleteRowFunctionProps {
  ids: string[];
  secretName: string;
}

/**
 * This component represent a single row for an environemnt variable on the dashboard
 * @param {object} obj
 * @param {String[]} obj.keyPair - data related to the environment variable (id, pos, key, value, public/private)
 * @param {function} obj.modifyKey - modify the key of a certain environment variable
 * @param {function} obj.modifyValue - modify the value of a certain environment variable
 * @param {function} obj.modifyValueOverride - modify the value of a certain environment variable if it is overriden
 * @param {function} obj.modifyComment - modify the comment of a certain environment variable
 * @param {boolean} obj.isBlurred - if the blurring setting is turned on
 * @param {boolean} obj.isDuplicate - list of all the duplicates secret names on the dashboard
 * @param {function} obj.toggleSidebar - open/close/switch sidebar
 * @param {string} obj.sidebarSecretId - the id of a secret for the side bar is displayed
 * @param {boolean} obj.isSnapshot - whether this keyPair is in a snapshot. If so, it won't have some features like sidebar
 * @param {function} obj.deleteRow - a function to delete a certain keyPair
 * @returns
 */
const KeyPair = ({
  keyPair,
  modifyKey,
  modifyValue,
  modifyValueOverride,
  modifyComment,
  isBlurred,
  isDuplicate,
  toggleSidebar,
  sidebarSecretId,
  isCapitalized,
  isSnapshot, 
  deleteRow
}: KeyPairProps) => (
  <div
    className={`group flex flex-col items-center border-b border-mineshaft-500 hover:bg-white/[0.03] duration-100 ${isSnapshot && 'pointer-events-none'} ${
      keyPair.id === sidebarSecretId && 'bg-mineshaft-700 duration-200'
    }`}
  >
    <div className="relative flex flex-row justify-between w-full mr-auto max-h-14 items-center">
      <div className='text-bunker-400 text-xs flex items-center justify-center w-14 h-10 cursor-default'>{keyPair.pos + 1}</div>
      <div className="w-80 border-r border-mineshaft-600">
        <div className="flex items-center max-h-16">
          <DashboardInputField
            isCapitalized = {isCapitalized}
            onChangeHandler={modifyKey}
            type="varName"
            position={keyPair.pos}
            value={keyPair.key}
            isDuplicate={isDuplicate}
            overrideEnabled={keyPair.valueOverride !== undefined}
            modifyValueOverride={modifyValueOverride}
            isSideBarOpen={keyPair.id === sidebarSecretId}
          />
        </div>
      </div>
      <div className="w-full border-r border-mineshaft-600">
        <div
          className='flex items-center rounded-lg mt-4 md:mt-0 max-h-10'
        >
          <DashboardInputField
            onChangeHandler={keyPair.valueOverride !== undefined ? modifyValueOverride : modifyValue}
            type="value"
            position={keyPair.pos}
            value={keyPair.valueOverride !== undefined ? keyPair.valueOverride : keyPair.value}
            blurred={isBlurred}
            overrideEnabled={keyPair.valueOverride !== undefined}
            isSideBarOpen={keyPair.id === sidebarSecretId}
          />
        </div>
      </div>
      <div className="w-96 border-r border-mineshaft-600">
        <div className="flex items-center max-h-16">
          <DashboardInputField
            onChangeHandler={modifyComment}
            type="comment"
            position={keyPair.pos}
            value={keyPair.comment}
            isDuplicate={isDuplicate}
            isSideBarOpen={keyPair.id === sidebarSecretId}
          />
        </div>
      </div>
      {!isSnapshot && (
        <div
          onKeyDown={() => null}
          role="button"
          tabIndex={0}
          onClick={() => toggleSidebar(keyPair.id)}
          className="cursor-pointer w-[2.35rem] h-[2.35rem] px-6 rounded-md invisible group-hover:visible flex flex-row justify-center items-center"
        >
          <FontAwesomeIcon className="text-bunker-300 hover:text-primary text-lg" icon={faEllipsis} />
        </div>
      )}
      {!isSnapshot && (
        <DeleteActionButton
          onSubmit={() => { if (deleteRow) {
            deleteRow({ ids: [keyPair.id], secretName: keyPair?.key })
          }}}
          isPlain
        />
      )}
    </div>
  </div>
);

export default KeyPair;
