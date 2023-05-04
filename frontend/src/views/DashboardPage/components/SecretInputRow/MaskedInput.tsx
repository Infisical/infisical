import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { faCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { twMerge } from 'tailwind-merge';

import { FormData } from '../../DashboardPage.utils';

type Props = {
  isReadOnly?: boolean;
  isSecretValueHidden?: boolean;
  isOverridden?: boolean;
  index: number;
};

const REGEX = /([$]{.*?})/g;

export const MaskedInput = ({ isReadOnly, isSecretValueHidden, index, isOverridden }: Props) => {
  const { register, control } = useFormContext<FormData>();

  const secretValue = useWatch({ control, name: `secrets.${index}.value` });
  const secretValueOverride = useWatch({ control, name: `secrets.${index}.valueOverride` });
  const value = isOverridden ? secretValueOverride : secretValue;

  const syntaxHighlight = useCallback((val: string) => {
    if (val?.length === 0) return <span className="font-sans text-bunker-400/80">EMPTY</span>;
    return val?.split(REGEX).map((word) =>
      word.match(REGEX) !== null ? (
        <span className="ph-no-capture text-yellow" key={`${val}-${index + 1}`}>
          {word.slice(0, 2)}
          <span className="ph-no-capture text-yellow-200/80">{word.slice(2, word.length - 1)}</span>
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
      ) : (
        <span key={`${word}_${index + 1}`} className="ph-no-capture">
          {word}
        </span>
      )
    );
  }, []);

  return (
    <div className="group relative flex	w-full flex-col justify-center whitespace-pre px-1.5">
      {isOverridden ? (
        <input
          {...register(`secrets.${index}.valueOverride`)}
          readOnly={isReadOnly}
          className={twMerge(
            'ph-no-capture min-w-16 no-scrollbar::-webkit-scrollbar duration-50 peer z-10 w-full bg-transparent px-2 py-2 font-mono text-sm text-transparent caret-white outline-none no-scrollbar',
            !isSecretValueHidden &&
              'text-transparent focus:text-transparent active:text-transparent'
          )}
          spellCheck="false"
        />
      ) : (
        <input
          {...register(`secrets.${index}.value`)}
          readOnly={isReadOnly}
          className={twMerge(
            'ph-no-capture min-w-16 no-scrollbar::-webkit-scrollbar duration-50 peer z-10 w-full bg-transparent px-2 py-2 font-mono text-sm text-transparent caret-white outline-none no-scrollbar',
            !isSecretValueHidden &&
              'text-transparent focus:text-transparent active:text-transparent'
          )}
          spellCheck="false"
        />
      )}
      <div
        className={twMerge(
          'ph-no-capture min-w-16 no-scrollbar::-webkit-scrollbar duration-50 absolute z-0 mt-0.5 flex h-10 w-full flex-row overflow-x-scroll whitespace-pre bg-transparent px-2 py-2 font-mono text-sm outline-none no-scrollbar peer-focus:visible',
          isSecretValueHidden ? 'invisible' : 'visible',
          isOverridden
            ? 'text-primary-300'
            : 'duration-50 text-gray-400 group-hover:text-gray-400 peer-focus:text-gray-100 peer-active:text-gray-400'
        )}
      >
        {syntaxHighlight(value || '')}
      </div>
      <div
        className={twMerge(
          'duration-50 peer absolute z-0 flex h-10 w-full flex-row items-center justify-between text-clip pr-2 text-bunker-400 group-hover:bg-white/[0.00] peer-focus:hidden peer-active:hidden',
          !isSecretValueHidden ? 'invisible' : 'visible'
        )}
      >
        <div className="no-scrollbar::-webkit-scrollbar flex flex-row items-center overflow-x-scroll px-2 no-scrollbar">
          {value?.split('').map((val, i) => (
            <FontAwesomeIcon
              key={`${value}_${val}_${i + 1}`}
              className="mr-0.5 text-xxs"
              icon={faCircle}
            />
          ))}
          {value?.split('').length === 0 && (
            <span className="text-sm text-bunker-400/80">EMPTY</span>
          )}
        </div>
      </div>
    </div>
  );
};
