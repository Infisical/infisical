import { useTranslation } from "next-i18next";
import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import patienceDiff from 'ee/utilities/findTextDifferences';

import DashboardInputField from '../../components/dashboard/DashboardInputField';


const secretChanges = [{
  "oldSecret": "secret1",
  "newSecret": "ecret2" 
}, {
  "oldSecret": "secret1",
  "newSecret": "sercet2" 
}, {
  "oldSecret": "localhosta:8080",
  "newSecret": "aaaalocalhoats:3000" 
}]


interface SideBarProps {
  toggleSidebar: (value: string[]) => void; 
  sidebarData: string[];
  currentEvent: string;
}

/**
 * @param {object} obj
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {string[]} obj.secretIds - data of payload
 * @param {string} obj.currentEvent - the event name for which a sidebar is being displayed
 * @returns the sidebar with the payload of user activity logs
 */
const ActivitySideBar = ({ 
  toggleSidebar, 
  sidebarData, 
  currentEvent
}: SideBarProps) => {
  const { t } = useTranslation();

  return <div className='absolute border-l border-mineshaft-500 bg-bunker fixed h-full w-96 top-14 right-0 z-50 shadow-xl flex flex-col justify-between'>
    <div className='h-min overflow-y-auto'>
      <div className="flex flex-row px-4 py-3 border-b border-mineshaft-500 justify-between items-center">
        <p className="font-semibold text-lg text-bunker-200">{t("activity:event." + currentEvent)}</p>
        <div className='p-1' onClick={() => toggleSidebar([])}>
          <FontAwesomeIcon icon={faX} className='w-4 h-4 text-bunker-300 cursor-pointer'/>
        </div>
      </div>
      <div className='flex flex-col px-4'>
        {currentEvent == 'readSecrets' && sidebarData.map((item, id) => 
          <>
            <div className='text-sm text-bunker-200 mt-4 pl-1'>Key {id}</div>
            <DashboardInputField
              key={id}
              onChangeHandler={() => {}}
              type="varName"
              position={1}
              value={"a" + item}
              isDuplicate={false}
              blurred={false}
            />
          </>
        )}
        {currentEvent == 'updateSecrets' && sidebarData.map((item, id) => 
        secretChanges.map(secretChange => 
          <>
            <div className='text-sm text-bunker-200 mt-4 pl-1'>Secret Name {id}</div>
            <div className='text-bunker-100 font-mono rounded-md overflow-hidden'>
              <div className='bg-red/30 px-2'>- {patienceDiff(secretChange.oldSecret.split(''), secretChange.newSecret.split(''), false).lines.map((character, id) => character.aIndex != -1 && <span key={id} className={`${character.bIndex == -1 && "bg-red-700/80"}`}>{character.line}</span>)}</div>
              <div className='bg-green-500/30 px-2'>+ {patienceDiff(secretChange.oldSecret.split(''), secretChange.newSecret.split('')).lines.map((character, id) => character.bIndex != -1 && <span key={id} className={`${character.aIndex == -1 && "bg-green-700/80"}`}>{character.line}</span>)}</div>
            </div>
          </>
        ))}
      </div>
    </div>

  </div>
};

export default ActivitySideBar;
