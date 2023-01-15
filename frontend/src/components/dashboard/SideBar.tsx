import { useState } from 'react';
import Image from 'next/image';
import { useTranslation } from "next-i18next";
import SecretVersionList from '@app/ee/components/SecretVersionList';
import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '../basic/buttons/Button';
import Toggle from '../basic/Toggle';
import CommentField from './CommentField';
import DashboardInputField from './DashboardInputField';
import { DeleteActionButton } from './DeleteActionButton';
import GenerateSecretMenu from './GenerateSecretMenu';


interface SecretProps {
  key: string;
  value: string;
  valueOverride: string | undefined;
  pos: number;
  id: string;
  comment: string;
}

interface OverrideProps {
  id: string;
  valueOverride: string;
}
export interface DeleteRowFunctionProps { 
  ids: string[]; 
  secretName: string; 
}

interface SideBarProps {
  toggleSidebar: (value: string) => void; 
  data: SecretProps[];
  modifyKey: (value: string, position: number) => void; 
  modifyValue: (value: string, position: number) => void; 
  modifyValueOverride: (value: string | undefined, position: number) => void; 
  modifyComment: (value: string, position: number) => void; 
  buttonReady: boolean;
  savePush: () => void;
  sharedToHide: string[];
  setSharedToHide: (values: string[]) => void;
  deleteRow: (props: DeleteRowFunctionProps) => void;
}

/**
 * @param {object} obj
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {SecretProps[]} obj.data - data of a certain key valeu pair
 * @param {function} obj.modifyKey - function that modifies the secret key
 * @param {function} obj.modifyValue - function that modifies the secret value
 * @param {function} obj.modifyValueOverride - function that modifies the secret value if it is an override
 * @param {boolean} obj.buttonReady - is the button for saving chagnes active
 * @param {function} obj.savePush - save changes andp ush secrets
 * @param {function} obj.deleteRow - a function to delete a certain keyPair
 * @returns the sidebar with 'secret's settings'
 */
const SideBar = ({ 
  toggleSidebar, 
  data, 
  modifyKey, 
  modifyValue, 
  modifyValueOverride, 
  modifyComment,
  buttonReady, 
  savePush,
  deleteRow
}: SideBarProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [overrideEnabled, setOverrideEnabled] = useState(data[0].valueOverride != undefined);
  const { t } = useTranslation();

  return <div className='absolute border-l border-mineshaft-500 bg-bunker fixed h-full w-96 top-14 right-0 z-40 shadow-xl flex flex-col justify-between'>
    {isLoading ? (
      <div className="flex items-center justify-center h-full">
        <Image
          src="/images/loading/loading.gif"
          height={60}
          width={100}
          alt="infisical loading indicator"
        ></Image>
      </div> 
      ) : (
      <div className='h-min overflow-y-auto'>
        <div className="flex flex-row px-4 py-3 border-b border-mineshaft-500 justify-between items-center">
          <p className="font-semibold text-lg text-bunker-200">{t("dashboard:sidebar.secret")}</p>
          <div className='p-1' onClick={() => toggleSidebar("None")}>
            <FontAwesomeIcon icon={faX} className='w-4 h-4 text-bunker-300 cursor-pointer'/>
          </div>
        </div>
        <div className='mt-4 px-4 pointer-events-none'>
          <p className='text-sm text-bunker-300'>{t("dashboard:sidebar.key")}</p>
          <DashboardInputField
            onChangeHandler={modifyKey}
            type="varName"
            position={data[0]?.pos}
            value={data[0]?.key}
            isDuplicate={false}
            blurred={false}
          />
        </div>
        {data[0]?.value 
          ? <div className={`relative mt-2 px-4 ${overrideEnabled && "opacity-40 pointer-events-none"} duration-200`}>
          <p className='text-sm text-bunker-300'>{t("dashboard:sidebar.value")}</p>
          <DashboardInputField
            onChangeHandler={modifyValue}
            type="value"
            position={data[0].pos}
            value={data[0]?.value}
            isDuplicate={false}
            blurred={true}     
          />
          <div className='absolute bg-bunker-800 right-[1.07rem] top-[1.6rem] z-50'>
            <GenerateSecretMenu modifyValue={modifyValue} position={data[0]?.pos} />
          </div>
        </div>
          : <div className='px-4 text-sm text-bunker-300 pt-4'>
            <span className='py-0.5 px-1 rounded-md bg-primary-200/10 mr-1'>{t("common:note")}:</span>
            {t("dashboard:sidebar.personal-explanation")}
          </div>}
        <div className='mt-4 px-4'>
          {data[0]?.value &&
          <div className='flex flex-row items-center justify-between my-2 pl-1 pr-2'>
            <p className='text-sm text-bunker-300'>{t("dashboard:sidebar.override")}</p>
            <Toggle 
              enabled={overrideEnabled} 
              setEnabled={setOverrideEnabled} 
              addOverride={modifyValueOverride} 
              pos={data[0]?.pos}
            />
          </div>}
          <div className={`relative ${!overrideEnabled && "opacity-40 pointer-events-none"} duration-200`}>
            <DashboardInputField
              onChangeHandler={modifyValueOverride}
              type="value"
              position={data[0]?.pos}
              value={overrideEnabled ? data[0]?.valueOverride : data[0]?.value}
              isDuplicate={false}
              blurred={true}
            />
            <div className='absolute right-[0.57rem] top-[0.3rem] z-50'>
              <GenerateSecretMenu modifyValue={modifyValueOverride} position={data[0]?.pos} />
            </div>
          </div>
        </div>
        <SecretVersionList secretId={data[0]?.id} />
        <CommentField comment={data[0]?.comment} modifyComment={modifyComment} position={data[0]?.pos} />
      </div>
    )}
    <div className={`flex justify-start max-w-sm mt-4 px-4 mt-full mb-[4.7rem]`}>
      <Button
        text={String(t("common:save-changes"))}
        onButtonPressed={savePush}
        color="primary"
        size="md"
        active={buttonReady}
        textDisabled="Saved"
      />
      <DeleteActionButton 
        onSubmit={() => deleteRow({ ids: data.map(secret => secret.id), secretName: data[0]?.key })}
      />
    </div>
  </div>
};

export default SideBar;
