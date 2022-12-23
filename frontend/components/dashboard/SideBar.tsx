import { useState } from 'react';
import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '../basic/buttons/Button';
import ListBox from '../basic/Listbox';
import Toggle from '../basic/Toggle';
import DashboardInputField from './DashboardInputField';
import GenerateSecretMenu from './GenerateSecretMenu';


interface SecretProps {
  key: string;
  value: string;
  pos: number;
  visibility: string;
}

interface SideBarProps {
  toggleSidebar: (value: number) => void; 
  data: SecretProps[];
  modifyKey: (value: string) => void; 
  modifyValue: (value: string) => void; 
  modifyVisibility: (value: string) => void; 
}

/**
 * @param {object} obj
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {SecretProps[]} obj.data - data of a certain key valeu pair
 * @param {function} obj.modifyKey - function that modifies the secret key
 * @param {function} obj.modifyValue - function that modifies the secret value
 * @param {function} obj.modifyVisibility - function that modifies the secret visibility
 * @returns the sidebar with 'secret's settings'
 */
const SideBar = ({ toggleSidebar, data, modifyKey, modifyValue, modifyVisibility }: SideBarProps) => {
  const [overrideEnabled, setOverrideEnabled] = useState(false);

  return <div className='absolute border-l border-mineshaft-500 bg-bunker fixed h-full w-96 top-14 right-0 z-50 shadow-xl flex flex-col justify-between'>
    <div className='h-min'>
      <div className="flex flex-row px-4 py-3 border-b border-mineshaft-500 justify-between items-center">
        <p className="font-semibold text-lg text-bunker-200">Secret</p>
        <div className='p-1' onClick={() => toggleSidebar(-1)}>
          <FontAwesomeIcon icon={faX} className='w-4 h-4 text-bunker-300 cursor-pointer'/>
        </div>
      </div>
      <div className='mt-4 px-4'>
        <p className='text-sm text-bunker-300'>Key</p>
        <DashboardInputField
          onChangeHandler={modifyKey}
          type="varName"
          position={data[0].pos}
          value={data[0].key}
          duplicates={[]}
          blurred={false}
        />
      </div>
      <div className={`relative mt-2 px-4 ${overrideEnabled && "opacity-40 pointer-events-none"} duration-200`}>
        <p className='text-sm text-bunker-300'>Value</p>
        <DashboardInputField
          onChangeHandler={modifyValue}
          type="value"
          position={data[0].pos}
          value={data[0].value}
          duplicates={[]}
          blurred={true}
        />
        <div className='absolute bg-bunker-800 right-[1rem] top-[1.65rem] z-50'>
          <GenerateSecretMenu />
        </div>
      </div>
      <div className='mt-4 px-4'>
        <div className='flex flex-row items-center justify-between my-2 pl-1 pr-2'>
          <p className='text-sm text-bunker-300'>Override value with a personal value</p>
          <Toggle enabled={overrideEnabled} setEnabled={setOverrideEnabled} />
        </div>
        <div className={`relative ${!overrideEnabled && "opacity-40 pointer-events-none"} duration-200`}>
          <DashboardInputField
            onChangeHandler={modifyValue}
            type="value"
            position={data[0].pos}
            value={"ValueValueValue"}
            duplicates={[]}
            blurred={true}
          />
          <div className='absolute right-3 top-[0.3rem] z-50'>
            <GenerateSecretMenu />
          </div>
        </div>
      </div>
      <div className={`relative mt-4 px-4 opacity-80 duration-200`}>
        <p className='text-sm text-bunker-200'>Group</p>
        <ListBox
          selected={"Database Secrets"}
          onChange={() => {}}
          data={["Group1"]}
          isFull={true}
        />
      </div>
      <div className={`mt-4 px-4`}>
        <p className='text-sm text-bunker-300'>Comments & notes</p>
        <div className='h-32 w-full bg-bunker-800 p-2 rounded-md border border-mineshaft-500 rounded-md text-sm text-bunker-300'> 
          Leave your comment here...
        </div>
      </div>
    </div>
    <div className='mt-full px-4 mb-[4.7rem]'>
      <Button
        onButtonPressed={() => console.log('Saved')}
        text="Save Changes"
        color="primary"
        size="md"
      />
    </div>
  </div>
};

export default SideBar;
