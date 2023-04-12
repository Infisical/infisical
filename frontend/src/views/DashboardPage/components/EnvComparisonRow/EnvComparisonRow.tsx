/* eslint-disable react/jsx-no-useless-fragment */
import { SyntheticEvent, useRef } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { faCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import guidGenerator from '@app/components/utilities/randomId';
import { Input } from '@app/components/v2';

import { FormData, SecretActionType } from '../../DashboardPage.utils';

type Props = {
  index: number;
  secrets: any[] | undefined;
  // permission and external state's that decided to hide or show
  isReadOnly?: boolean;
  isAddOnly?: boolean;
  isSecretValueHidden: boolean;
  userAvailableEnvs?: any[];
};

const REGEX = /([$]{.*?})/g;

const DashboardInput = ({ isOverridden, isSecretValueHidden, isAddOnly, isReadOnly, secret, shouldBeBlockedInAddOnly, index }: { isOverridden: boolean, isSecretValueHidden: boolean, isAddOnly?: boolean, isReadOnly?: boolean, secret: any, shouldBeBlockedInAddOnly?: boolean, index: number } ): JSX.Element => {
  const ref = useRef<HTMLDivElement | null>(null);
  const syncScroll = (e: SyntheticEvent<HTMLDivElement>) => {
    if (ref.current === null) return;

    ref.current.scrollTop = e.currentTarget.scrollTop;
    ref.current.scrollLeft = e.currentTarget.scrollLeft;
  };
  console.log(33333333, secret)

  return <td className="flex flex-row w-full justify-center h-10 items-center bg-mineshaft-900">
    <div className="group relative whitespace-pre	flex flex-col justify-center w-full">
      <input
        // {...register(`secrets.${index}.valueOverride`)}
        value={(isOverridden ? secret.valueOverride : secret?.value || '-')}
        onScroll={syncScroll}
        readOnly={isReadOnly || (isOverridden ? isAddOnly : shouldBeBlockedInAddOnly)}
        className={`${
          isSecretValueHidden
            ? 'text-transparent focus:text-transparent active:text-transparent'
            : ''
        } z-10 peer font-mono ph-no-capture bg-transparent caret-transparent text-transparent text-sm px-2 py-2 w-full min-w-16 outline-none duration-200 no-scrollbar no-scrollbar::-webkit-scrollbar`}
        spellCheck="false"
      />
      <div
        ref={ref}
        className={`${
          isSecretValueHidden && !isOverridden && secret?.value
            ? 'text-bunker-800 group-hover:text-gray-400 peer-focus:text-gray-100 peer-active:text-gray-400 duration-200'
            : ''
        } ${!secret?.value && "text-bunker-400 justify-center"}
        absolute flex flex-row whitespace-pre font-mono z-0 ${isSecretValueHidden && secret?.value ? 'invisible' : 'visible'} peer-focus:visible mt-0.5 ph-no-capture overflow-x-scroll bg-transparent h-10 text-sm px-2 py-2 w-full min-w-16 outline-none duration-100 no-scrollbar no-scrollbar::-webkit-scrollbar`}
      >
        {(isOverridden ? secret.valueOverride : secret?.value || '-')?.split('').length === 0 && <span className='text-bunker-400/80 font-sans'>EMPTY</span>}
        {(isOverridden ? secret.valueOverride : secret?.value || '-')?.split(REGEX).map((word: string) => {
          if (word.match(REGEX) !== null) {
            return (
              <span className="ph-no-capture text-yellow" key={index}>
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
      </div>
      {(isSecretValueHidden && secret?.value) && (
        <div className='absolute flex flex-row justify-between items-center z-0 peer pr-2 peer-active:hidden peer-focus:hidden group-hover:bg-white/[0.00] duration-100 h-10 w-full text-bunker-400 text-clip'>
          <div className="px-2 flex flex-row items-center overflow-x-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
            {(isOverridden ? secret.valueOverride : secret?.value || '-')?.split('').map(() => (
              <FontAwesomeIcon
                key={guidGenerator()}
                className="text-xxs mr-0.5"
                icon={faCircle}
              />
            ))}
            {(isOverridden ? secret.valueOverride : secret?.value || '-')?.split('').length === 0 && <span className='text-bunker-400/80 text-sm'>EMPTY</span>}
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
  isAddOnly,
  userAvailableEnvs
}: Props): JSX.Element => {
  const { 
    // register, setValue, 
    control } = useFormContext<FormData>();
  console.log(1282828822, userAvailableEnvs)

  console.log('index', index)
  // to get details on a secret
  const secret = useWatch({ name: `secrets.${index}`, control });

  // when secret is override by personal values
  const isOverridden =
    secret.overrideAction === SecretActionType.Created ||
    secret.overrideAction === SecretActionType.Modified;

  const isCreatedSecret = !secret?._id;
  const shouldBeBlockedInAddOnly = !isCreatedSecret && isAddOnly;
  console.log(893892749827097, secrets)

  return (
    <tr className="group min-w-full flex flex-row items-center">
      <td className="w-10 h-10 px-4 flex items-center justify-center"><div className='text-center w-10 text-xs text-bunker-400'>{index + 1}</div></td>
      <td className="border-none">
        <div className="min-w-[220px] lg:min-w-[240px] xl:min-w-[280px] relative flex items-center justify-end w-full">
          <Input
            autoComplete="off"
            variant="plain"
            isDisabled={isReadOnly || shouldBeBlockedInAddOnly}
            className="w-full focus:text-bunker-100 focus:ring-transparent"
            value={secret.key}
          />
        </div>
      </td>
      {userAvailableEnvs?.map(env => {
        return <>
          <td className="w-10 px-4 flex items-center justify-center h-10">
            <div className='text-center w-10 text-xs text-transparent'>{0}</div>
          </td>
          <DashboardInput isOverridden={isOverridden} isSecretValueHidden={isSecretValueHidden} isAddOnly={isAddOnly} isReadOnly={isReadOnly} secret={secrets?.filter(sec => sec.env === env.slug)[0]} shouldBeBlockedInAddOnly={shouldBeBlockedInAddOnly} index={index} />
        </>
      })}
    </tr>
  );
};
