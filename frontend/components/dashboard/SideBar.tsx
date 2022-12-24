import { useState } from 'react';
import { faBackward, faDotCircle, faRotateLeft, faX } from '@fortawesome/free-solid-svg-icons';
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
  id: string;
}

interface OverrideProps {
  id: string;
  keyName: string;
  value: string;
  pos: number;
}

interface SideBarProps {
  toggleSidebar: (value: number) => void; 
  data: SecretProps[];
  modifyKey: (value: string) => void; 
  modifyValue: (value: string) => void; 
  modifyVisibility: (value: string) => void; 
  addOverride: (value: OverrideProps) => void; 
  deleteOverride: (id: string) => void; 
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
const SideBar = ({ toggleSidebar, data, modifyKey, modifyValue, modifyVisibility, addOverride, deleteOverride }: SideBarProps) => {
  const [overrideEnabled, setOverrideEnabled] = useState(false);

  return <div className='absolute border-l border-mineshaft-500 bg-bunker fixed h-full w-96 top-14 right-0 z-50 shadow-xl flex flex-col justify-between'>
    <div className='h-min'>
      <div className="flex flex-row px-4 py-3 border-b border-mineshaft-500 justify-between items-center">
        <p className="font-semibold text-lg text-bunker-200">Secret</p>
        <div className='p-1' onClick={() => toggleSidebar(-1)}>
          <FontAwesomeIcon icon={faX} className='w-4 h-4 text-bunker-300 cursor-pointer'/>
        </div>
      </div>
      <div className='mt-4 px-4 pointer-events-none'>
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
          value={data[0].value + "xxx" + data[0].pos}
          duplicates={[]}
          blurred={true}     
        />
        <div className='absolute bg-bunker-800 right-[1.07rem] top-[1.6rem] z-50'>
          <GenerateSecretMenu />
        </div>
      </div>
      <div className='mt-4 px-4'>
        <div className='flex flex-row items-center justify-between my-2 pl-1 pr-2'>
          <p className='text-sm text-bunker-300'>Override value with a personal value</p>
          <Toggle 
            enabled={overrideEnabled} 
            setEnabled={setOverrideEnabled} 
            addOverride={addOverride} 
            keyName={data[0].key}
            value={data[0].value}
            pos={data[0].pos}
            id={data[0].id}
            deleteOverride={deleteOverride}
          />
        </div>
        <div className={`relative ${!overrideEnabled && "opacity-40 pointer-events-none"} duration-200`}>
          <DashboardInputField
            onChangeHandler={modifyValue}
            type="value"
            position={data[0].pos}
            value={"ValueValueValue" + data[0].pos}
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
      <div className='w-full h-52 px-4 mt-4 text-sm text-bunker-300 overflow-x-none'>
        <p className=''>Version History</p>
        <div className='p-1 rounded-md bg-bunker-800 border border-mineshaft-500 overflow-x-none'>
          <div className='h-48 overflow-y-scroll overflow-x-none'>
            <div className='flex flex-row'>
              <div className='pr-1 flex flex-col items-center'>
                <div className='p-1'><FontAwesomeIcon icon={faDotCircle} /></div>
                <div className='w-0 h-full border-l mt-1'></div>
              </div>
              <div className='flex flex-col w-full max-w-[calc(100%-2.3rem)]'>
                <div className='pr-2 pt-1'>Current</div>
                <div className=''><p className='break-words'><span className='py-0.5 px-1 rounded-md bg-primary-300/20 mr-1.5'>Key:</span>{data[0].key}</p></div>
                <div className=''><p className='break-words'><span className='py-0.5 px-1 rounded-md bg-primary-300/20 mr-1.5'>Value:</span>{data[0].value}</p></div>
                <div className='pb-1'><p className='break-words'><span className='py-0.5 px-1 rounded-md bg-primary-300/20 mr-1.5'>Visibility:</span>{'shared'}</p></div>
              </div>
            </div>
            <div className='flex flex-row'>
              <div className='pr-1 flex flex-col items-center'>
                <div className='cursor-pointer p-1 hover:bg-bunker-500 rounded-md'><FontAwesomeIcon icon={faRotateLeft} /></div>
                <div className='w-0 h-full border-l'></div>
              </div>
              <div className='flex flex-col max-w-[calc(100%-2.3rem)]'>
                <div className='pr-2 pt-1'>12/22/2022 12:36 EST</div>
                <div className='w-full pr-2'><span className='py-0.5 px-1 rounded-md bg-primary-200/10 mr-1'>Key:</span> KeyKeyKey</div>
                <div className='w-full pr-2'><span className='py-0.5 px-1 rounded-md bg-primary-200/10 mr-1'>Value:</span> ValueValueValue</div>
                <div className='pb-1'><p className='break-words'><span className='py-0.5 px-1 rounded-md bg-primary-300/20 mr-1.5'>Visibility:</span>{'shared'}</p></div>
              </div>
            </div>
            <div className='flex flex-row'>
              <div className='pr-1 flex flex-col items-center'>
                <div className='cursor-pointer p-1 hover:bg-bunker-500 rounded-md'><FontAwesomeIcon icon={faRotateLeft} /></div>
                <div className='w-0 h-full border-l'></div>
              </div>
              <div className='flex flex-col max-w-[calc(100%-2.3rem)]'>
                <div className='pr-2 pt-1'>12/21/2022 09:11 EST</div>
                <div className='w-full pr-2'><span className='py-0.5 px-1 rounded-md bg-primary-200/10 mr-1'>Key:</span> KeyKey</div>
                <div className='w-full pr-2'><span className='py-0.5 px-1 rounded-md bg-primary-200/10 mr-1'>Value:</span> ValueValue</div>
                <div className='pb-1'><p className='break-words'><span className='py-0.5 px-1 rounded-md bg-primary-300/20 mr-1.5'>Visibility:</span>{'shared'}</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`relative mt-4 px-4 pt-4`}>
        <div className='flex flex-row justify-between'>
          <p className='text-sm text-bunker-300'>Comments & notes</p>
          <div className="bg-yellow rounded-md h-min">
            <p className="relative text-black text-xs px-1.5 h-min">Coming soon!</p>
          </div>
        </div>
        <div className='h-32 opacity-50 w-full bg-bunker-800 p-2 rounded-md border border-mineshaft-500 rounded-md text-sm text-bunker-300'> 
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
