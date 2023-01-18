import { memo, SyntheticEvent, useRef } from 'react';
import { faCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import guidGenerator from '../utilities/randomId';

const REGEX = /([$]{.*?})/g;

interface DashboardInputFieldProps {
  position: number;
  onChangeHandler: (value: string, position: number) => void;
  value: string | undefined;
  type: 'varName' | 'value';
  blurred?: boolean;
  isDuplicate?: boolean;
  override?: boolean;
}

/**
 * This component renders the input fields on the dashboard
 * @param {object} obj - the order number of a keyPair
 * @param {number} obj.position - the order number of a keyPair
 * @param {function} obj.onChangeHandler - what happens when the input is modified
 * @param {string} obj.type - whether the input field is for a Key Name or for a Key Value
 * @param {string} obj.value - value of the InputField
 * @param {boolean} obj.blurred - whether the input field should be blurred (behind the gray dots) or not; this can be turned on/off in the dashboard
 * @param {boolean} obj.isDuplicate - if the key name is duplicated
 * @param {boolean} obj.override - whether a secret/row should be displalyed as overriden
 * @returns
 */

const DashboardInputField = ({
  position,
  onChangeHandler,
  type,
  value,
  blurred,
  isDuplicate,
  override
}: DashboardInputFieldProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const syncScroll = (e: SyntheticEvent<HTMLDivElement>) => {
    if (ref.current === null) return;

    ref.current.scrollTop = e.currentTarget.scrollTop;
    ref.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  if (type === 'varName') {
    const startsWithNumber = !Number.isNaN(Number(value?.charAt(0))) && value !== '';
    const error = startsWithNumber || isDuplicate;

    return (
      <div className="flex-col w-full">
        <div
          className={`group relative flex flex-col justify-center w-full border ${
            error ? 'border-red' : 'border-mineshaft-500'
          } rounded-md`}
        >
          <input
            onChange={(e) => onChangeHandler(e.target.value.toUpperCase(), position)}
            type={type}
            value={value}
            className={`z-10 peer font-mono ph-no-capture bg-bunker-800 rounded-md caret-white text-gray-400 text-md px-2 py-1.5 w-full min-w-16 outline-none focus:ring-2 ${
              error ? 'focus:ring-red/50' : 'focus:ring-primary/50'
            } duration-200`}
            spellCheck="false"
          />
        </div>
        {startsWithNumber && (
          <p className="text-red text-xs mt-0.5 mx-1 mb-2 max-w-xs">
            Should not start with a number
          </p>
        )}
        {isDuplicate && !startsWithNumber && (
          <p className="text-red text-xs mt-0.5 mx-1 mb-2 max-w-xs">
            Secret names should be unique
          </p>
        )}
      </div>
    );
  }
  if (type === 'value') {
    return (
      <div className="flex-col w-full">
        <div className="group relative whitespace-pre	flex flex-col justify-center w-full border border-mineshaft-500 rounded-md">
          {override === true && (
            <div className="bg-primary-300 absolute top-[0.1rem] right-[0.1rem] z-10 w-min text-xxs px-1 text-black opacity-80 rounded-md">
              Override enabled
            </div>
          )}
          <input
            value={value}
            onChange={(e) => onChangeHandler(e.target.value, position)}
            onScroll={syncScroll}
            className={`${
              blurred
                ? 'text-transparent group-hover:text-transparent focus:text-transparent active:text-transparent'
                : ''
            } z-10 peer font-mono ph-no-capture bg-transparent rounded-md caret-white text-transparent text-md px-2 py-1.5 w-full min-w-16 outline-none focus:ring-2 focus:ring-primary/50 duration-200 no-scrollbar no-scrollbar::-webkit-scrollbar`}
            spellCheck="false"
          />
          <div
            ref={ref}
            className={`${
              blurred && !override
                ? 'text-bunker-800 group-hover:text-gray-400 peer-focus:text-gray-400 peer-active:text-gray-400'
                : ''
            } ${override ? 'text-primary-300' : 'text-gray-400'}
            absolute flex flex-row whitespace-pre font-mono z-0 ph-no-capture overflow-x-scroll bg-bunker-800 h-9 rounded-md text-md px-2 py-1.5 w-full min-w-16 outline-none focus:ring-2 focus:ring-primary/50 duration-100 no-scrollbar no-scrollbar::-webkit-scrollbar`}
          >
            {value?.split(REGEX).map((word, id) => {
              if (word.match(REGEX) !== null) {
                return (
                  <span className="ph-no-capture text-yellow" key={`${word}.${id + 1}`}>
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
                <span key={`${word}_${id + 1}`} className="ph-no-capture">
                  {word}
                </span>
              );
            })}
          </div>
          {blurred && (
            <div className="absolute flex flex-row items-center z-20 peer pr-2 bg-bunker-800 group-hover:hidden peer-hover:hidden peer-focus:hidden peer-active:invisible h-9 w-full rounded-md text-gray-400/50 text-clip">
              <div className="px-2 flex flex-row items-center overflow-x-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
                {value?.split('').map(() => (
                  <FontAwesomeIcon
                    key={guidGenerator()}
                    className="text-xxs mx-0.5"
                    icon={faCircle}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <>Something Wrong</>;
};

function inputPropsAreEqual(prev: DashboardInputFieldProps, next: DashboardInputFieldProps) {
  return (
    prev.value === next.value &&
    prev.type === next.type &&
    prev.position === next.position &&
    prev.blurred === next.blurred &&
    prev.override === next.override &&
    prev.isDuplicate === next.isDuplicate
  );
}

export default memo(DashboardInputField, inputPropsAreEqual);
