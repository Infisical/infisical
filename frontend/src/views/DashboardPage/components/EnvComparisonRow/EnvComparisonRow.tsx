/* eslint-disable react/jsx-no-useless-fragment */
import { SyntheticEvent, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { faCircle, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import guidGenerator from '@app/components/utilities/randomId';

import { FormData } from '../../DashboardPage.utils';

type Props = {
  index: number;
  secrets: any[] | undefined;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isSecretValueHidden: boolean;
  userAvailableEnvs?: any[];
};

const REGEX = /([$]{.*?})/g;

const DashboardInput = ({ isOverridden, isSecretValueHidden, isReadOnly, secret, index }: { isOverridden: boolean, isSecretValueHidden: boolean, isReadOnly?: boolean, secret: any, index: number } ): JSX.Element => {
  const ref = useRef<HTMLDivElement | null>(null);
  const syncScroll = (e: SyntheticEvent<HTMLDivElement>) => {
    if (ref.current === null) return;

    ref.current.scrollTop = e.currentTarget.scrollTop;
    ref.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  return <td key={`row-${secret?.key || ''}--`} className={`flex cursor-default flex-row w-full min-w-[11rem] justify-center h-10 items-center ${!(secret?.value || secret?.value === '') ? "bg-red-400/10" : "bg-mineshaft-900/30"}`}>
    <div className="group relative whitespace-pre	flex flex-col justify-center w-full cursor-default">
      <input
        // {...register(`secrets.${index}.valueOverride`)}
        defaultValue={(isOverridden ? secret.valueOverride : secret?.value || '')}
        onScroll={syncScroll}
        readOnly={isReadOnly}
        className={`${
          isSecretValueHidden
            ? 'text-transparent focus:text-transparent active:text-transparent'
            : ''
        } z-10 peer cursor-default font-mono ph-no-capture bg-transparent caret-transparent text-transparent text-sm px-2 py-2 w-full outline-none duration-200 no-scrollbar no-scrollbar::-webkit-scrollbar`}
        spellCheck="false"
      />
      <div
        ref={ref}
        className={`${
          isSecretValueHidden && !isOverridden && secret?.value
            ? 'text-bunker-800 group-hover:text-gray-400 peer-focus:text-gray-100 peer-active:text-gray-400 duration-200'
            : ''
        } ${!secret?.value && "text-bunker-400 justify-center"}
        absolute cursor-default flex flex-row whitespace-pre font-mono z-0 ${isSecretValueHidden && secret?.value ? 'invisible' : 'visible'} peer-focus:visible mt-0.5 ph-no-capture overflow-x-scroll bg-transparent h-10 text-sm px-2 py-2 w-full min-w-16 outline-none duration-100 no-scrollbar no-scrollbar::-webkit-scrollbar`}
      >
        {(secret?.value || secret?.value === '') && (isOverridden ? secret.valueOverride : secret?.value)?.split('').length === 0 && <span className='text-bunker-400/80 font-sans w-full'>EMPTY</span>}
        {(secret?.value || secret?.value === '') && (isOverridden ? secret.valueOverride : secret?.value)?.split(REGEX).map((word: string) => {
          if (word.match(REGEX) !== null) {
            return (
              <span className="ph-no-capture text-yellow" key={word}>
                {word.slice(0, 2)}
                <span className="ph-no-capture text-yellow-200/80">
                  {word.slice(2, word.length - 1)}
                </span>
                {word.slice(word.length - 1, word.length) === '}' ? (
                  <span className="ph-no-capture text-yellow">
                    {word.slice(word.length - 1, word.length)}
                  </span>
                ) : (
                  <span className="ph-no-capture text-yellow-400">
                    {word.slice(word.length - 1, word.length)}
                  </span>
                )}
              </span>
            );
          }
          return (
            <span key={`${word}_${index + 1}`} className="ph-no-capture">
              {word}
            </span>
          );
        })}
        {!(secret?.value || secret?.value === '') && <span className='text-red-500/80 cursor-default font-sans text-xs italic'>missing</span>}
      </div>
      {(isSecretValueHidden && secret?.value) && (
        <div className='absolute flex flex-row justify-between items-center z-0 peer pr-2 peer-active:hidden peer-focus:hidden group-hover:bg-white/[0.00] duration-100 h-10 w-full text-bunker-400 text-clip'>
          <div className="px-2 flex flex-row items-center overflow-x-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
            {(isOverridden ? secret.valueOverride : secret?.value || '')?.split('').map(() => (
              <FontAwesomeIcon
                key={guidGenerator()}
                className="text-xxs mr-0.5"
                icon={faCircle}
              />
            ))}
            {(isOverridden ? secret.valueOverride : secret?.value || '')?.split('').length === 0 && <span className='text-bunker-400/80 text-sm'>EMPTY</span>}
          </div>
        </div>
      )}
    </div>
  </td>
}

export const EnvComparisonRow = ({
  index,
  secrets,
  isSecretValueHidden,
  isReadOnly,
  userAvailableEnvs
}: Props): JSX.Element => {
  const { 
    // register, setValue, 
    control } = useFormContext<FormData>();

  // to get details on a secret
  const secret = useWatch({ name: `secrets.${index}`, control });

  const [areValuesHiddenThisRow, setAreValuesHiddenThisRow] = useState(true);

  return (
    <tr className="group min-w-full flex flex-row items-center hover:bg-bunker-700">
      <td className="w-10 h-10 px-4 flex items-center justify-center border-none"><div className='text-center w-10 text-xs text-bunker-400'>{index + 1}</div></td>
      <td className="flex flex-row justify-between items-center h-full min-w-[200px] lg:min-w-[220px] xl:min-w-[250px]">
        <div className="flex flex-row items-center h-8 cursor-default">{secret?.key || ''}</div>
        <button type="button" className='mr-2 text-bunker-400 hover:text-bunker-300 invisible group-hover:visible' onClick={() => setAreValuesHiddenThisRow(!areValuesHiddenThisRow)}>
          <FontAwesomeIcon icon={areValuesHiddenThisRow ? faEye : faEyeSlash} />
        </button>
      </td>
      {userAvailableEnvs?.map(env => {
        return <DashboardInput key={`row-${secret?.key || ''}-${env.slug}`} isOverridden={false} isSecretValueHidden={areValuesHiddenThisRow && isSecretValueHidden} isReadOnly={isReadOnly} secret={secrets?.filter(sec => sec.env === env.slug)[0]} index={index} />
      })}
    </tr>
  );
};
