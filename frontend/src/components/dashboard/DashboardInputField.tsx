import { memo, SyntheticEvent, useRef } from "react";
import { faCircle, faCodeBranch, faExclamationCircle, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import guidGenerator from "../utilities/randomId";
import { HoverObject } from "../v2/HoverCard";
import { PopoverObject } from "../v2/Popover/Popover";

const REGEX = /([$]{.*?})/g;

interface DashboardInputFieldProps {
  id: string;
  onChangeHandler: (value: string, id: string) => void;
  value: string | undefined;
  type: "varName" | "value" | "comment";
  blurred?: boolean;
  isDuplicate?: boolean;
  isCapitalized?: boolean;
  overrideEnabled?: boolean;
  modifyValueOverride?: (value: string | undefined, id: string) => void;
  isSideBarOpen?: boolean;
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
 * 
 * 
 * @returns
 */

const DashboardInputField = ({
  id,
  onChangeHandler,
  type,
  value,
  blurred,
  isDuplicate,
  isCapitalized,
  overrideEnabled,
  modifyValueOverride,
  isSideBarOpen
}: DashboardInputFieldProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const syncScroll = (e: SyntheticEvent<HTMLDivElement>) => {
    if (ref.current === null) return;

    ref.current.scrollTop = e.currentTarget.scrollTop;
    ref.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  if (type === "varName") {
    const startsWithNumber = !Number.isNaN(Number(value?.charAt(0))) && value !== "";
    const error = startsWithNumber || isDuplicate;

    return (
      <div className={`relative flex-col w-full h-10 ${
        error && value !== "" ? "bg-red/[0.15]" : ""
      } ${
        isSideBarOpen && "bg-mineshaft-700 duration-200"
      }`}>
        <div
          className={`group relative flex flex-col justify-center items-center h-full ${
            error ? "w-max" : "w-full"
          }`}
        >
          <input
            onChange={(e) => onChangeHandler(isCapitalized ? e.target.value.toUpperCase() : e.target.value, id)}
            type={type}
            value={value}
            className={`z-10 peer font-mono ph-no-capture bg-transparent h-full caret-bunker-200 text-sm px-2 w-full min-w-16 outline-none ${
              error ? "text-red-600 focus:text-red-500" : "text-bunker-300 focus:text-bunker-100"
            } duration-200`}
            spellCheck="false"
          />
        </div>
        {startsWithNumber && (
          <div className='absolute right-2 top-2 text-red z-50'>
            <HoverObject 
              text="Secret names should not start with a number"
              icon={faExclamationCircle}
              color="red"
            />
          </div>
        )}
        {isDuplicate && value !== "" && !startsWithNumber && (
          <div className='absolute right-2 top-2 text-red z-50'>
            <HoverObject 
              text="Secret names should be unique"
              icon={faExclamationCircle}
              color="red"
            />
          </div>
        )}
        {!error && <div className={`absolute right-0 top-0 text-red z-50 bg-mineshaft-800 group-hover:bg-mineshaft-700 ${
          overrideEnabled ? "visible" : "invisible group-hover:visible"
        } cursor-pointer duration-0 h-10 flex items-center px-2`}>
          <button type="button" onClick={() => {
            if (modifyValueOverride) {
              if (overrideEnabled === false) {
                modifyValueOverride("", id);
              } else {
                modifyValueOverride(undefined, id);
              }
            }
          }}>
            <HoverObject 
              text={overrideEnabled ? "This secret is overriden with your personal value" : "You can override this secret with a personal value"}
              icon={faCodeBranch}
              color={overrideEnabled ? "primary" : "bunker-400"}
            />
          </button>
        </div>}
      </div>
    );
  }
  if (type === "comment") {
    const startsWithNumber = !Number.isNaN(Number(value?.charAt(0))) && value !== "";
    const error = startsWithNumber || isDuplicate;

    return (
      <PopoverObject text={value || ""} onChangeHandler={onChangeHandler} id={id}>
        <div title={value} className={`relative flex-col w-full h-10 overflow-hidden ${
          isSideBarOpen && "bg-mineshaft-700 duration-200"
        }`}>
          <div
            className={`group relative flex flex-col justify-center items-center h-full ${
              error ? "w-max" : "w-full"
            }`}
          >
            {value?.split("\n")[0] ? <span className='ph-no-capture truncate break-all bg-transparent leading-tight text-xs px-2 w-full min-w-16 outline-none text-bunker-300 focus:text-bunker-100 placeholder:text-bunker-400 placeholder:focus:text-transparent placeholder duration-200'>
              {value?.split("\n")[0]}
            </span> : <span className='text-bunker-400'>-</span> }
            {value?.split("\n")[1] && <span className='ph-no-capture truncate break-all bg-transparent leading-tight text-xs px-2 w-full min-w-16 outline-none text-bunker-300 focus:text-bunker-100 placeholder:text-bunker-400 placeholder:focus:text-transparent placeholder duration-200'>
              {value?.split("\n")[1]}
            </span>}
          </div>
        </div>
      </PopoverObject>
    );
  }
  if (type === "value") {
    return (
      <div className="flex-col w-full">
        <div className="group relative whitespace-pre	flex flex-col justify-center w-full">
          {overrideEnabled === true && (
            <div className="bg-primary-500 rounded-sm absolute top-[0.1rem] right-[0.1rem] z-0 w-min text-xxs px-1 text-black opacity-80">
              Override enabled
            </div>
          )}
          <input
            value={value}
            onChange={(e) => onChangeHandler(e.target.value, id)}
            onScroll={syncScroll}
            className={`${
              blurred
                ? "text-transparent focus:text-transparent active:text-transparent"
                : ""
            } z-10 peer font-mono ph-no-capture bg-transparent caret-white text-transparent text-sm px-2 py-2 w-full min-w-16 outline-none duration-200 no-scrollbar no-scrollbar::-webkit-scrollbar`}
            spellCheck="false"
          />
          <div
            ref={ref}
            className={`${
              blurred && !overrideEnabled
                ? "text-bunker-800 group-hover:text-gray-400 peer-focus:text-gray-100 peer-active:text-gray-400 duration-200"
                : ""
            } ${overrideEnabled ? "text-primary-300" : "text-gray-400"}
            absolute flex flex-row whitespace-pre font-mono z-0 ${blurred ? "invisible" : "visible"} peer-focus:visible mt-0.5 ph-no-capture overflow-x-scroll bg-transparent h-10 text-sm px-2 py-2 w-full min-w-16 outline-none duration-100 no-scrollbar no-scrollbar::-webkit-scrollbar`}
          >
            {value?.split(REGEX).map((word) => {
              if (word.match(REGEX) !== null) {
                return (
                  <span className="ph-no-capture text-yellow" key={id}>
                    {word.slice(0, 2)}
                    <span className="ph-no-capture text-yellow-200/80">
                      {word.slice(2, word.length - 1)}
                    </span>
                    {word.slice(word.length - 1, word.length) === "}" ? (
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
            <div className={`absolute flex flex-row justify-between items-center z-0 peer pr-2 ${
              isSideBarOpen ? "bg-mineshaft-700 duration-200" : "bg-mineshaft-800"
            } peer-active:hidden peer-focus:hidden group-hover:bg-white/[0.00] duration-100 h-10 w-full text-bunker-400 text-clip`}>
              <div className="px-2 flex flex-row items-center overflow-x-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
                {value?.split("").map(() => (
                  <FontAwesomeIcon
                    key={guidGenerator()}
                    className="text-xxs mr-0.5"
                    icon={faCircle}
                  />
                ))}
                {value?.split("").length === 0 && <span className='text-bunker-400/80'>EMPTY</span>}
              </div>
              <div className='invisible group-hover:visible cursor-default z-[100]'><FontAwesomeIcon icon={faEye} /></div>
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
    prev.id === next.id &&
    prev.blurred === next.blurred &&
    prev.isCapitalized === next.isCapitalized &&
    prev.overrideEnabled === next.overrideEnabled &&
    prev.isDuplicate === next.isDuplicate &&
    prev.isSideBarOpen === next.isSideBarOpen
  );
}

export default memo(DashboardInputField, inputPropsAreEqual);
