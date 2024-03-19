import { memo, SyntheticEvent, useRef } from "react";
import {
  faCircle,
  faCodeBranch,
  faExclamationCircle,
  faEye
} from "@fortawesome/free-solid-svg-icons";
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
      <div
        className={`relative h-10 w-full flex-col ${error && value !== "" ? "bg-red/[0.15]" : ""} ${
          isSideBarOpen && "bg-mineshaft-700 duration-200"
        }`}
      >
        <div
          className={`group relative flex h-full flex-col items-center justify-center ${
            error ? "w-max" : "w-full"
          }`}
        >
          <input
            onChange={(e) =>
              onChangeHandler(isCapitalized ? e.target.value.toUpperCase() : e.target.value, id)
            }
            type={type}
            value={value}
            className={`ph-no-capture min-w-16 peer z-10 h-full w-full bg-transparent px-2 font-mono text-sm caret-bunker-200 outline-none ${
              error ? "text-red-600 focus:text-red-500" : "text-bunker-300 focus:text-bunker-100"
            } duration-200`}
            spellCheck="false"
          />
        </div>
        {startsWithNumber && (
          <div className="absolute right-2 top-2 z-50 text-red">
            <HoverObject
              text="Secret names should not start with a number"
              icon={faExclamationCircle}
              color="red"
            />
          </div>
        )}
        {isDuplicate && value !== "" && !startsWithNumber && (
          <div className="absolute right-2 top-2 z-50 text-red">
            <HoverObject
              text="Secret names should be unique"
              icon={faExclamationCircle}
              color="red"
            />
          </div>
        )}
        {!error && (
          <div
            className={`absolute right-0 top-0 z-50 bg-mineshaft-800 text-red group-hover:bg-mineshaft-700 ${
              overrideEnabled ? "visible" : "invisible group-hover:visible"
            } duration-0 flex h-10 cursor-pointer items-center px-2`}
          >
            <button
              type="button"
              onClick={() => {
                if (modifyValueOverride) {
                  if (overrideEnabled === false) {
                    modifyValueOverride("", id);
                  } else {
                    modifyValueOverride(undefined, id);
                  }
                }
              }}
            >
              <HoverObject
                text={
                  overrideEnabled
                    ? "This secret is overriden with your personal value"
                    : "You can override this secret with a personal value"
                }
                icon={faCodeBranch}
                color={overrideEnabled ? "primary" : "bunker-400"}
              />
            </button>
          </div>
        )}
      </div>
    );
  }
  if (type === "comment") {
    const startsWithNumber = !Number.isNaN(Number(value?.charAt(0))) && value !== "";
    const error = startsWithNumber || isDuplicate;

    return (
      <PopoverObject text={value || ""} onChangeHandler={onChangeHandler} id={id}>
        <div
          title={value}
          className={`relative h-10 w-full flex-col overflow-hidden ${
            isSideBarOpen && "bg-mineshaft-700 duration-200"
          }`}
        >
          <div
            className={`group relative flex h-full flex-col items-center justify-center ${
              error ? "w-max" : "w-full"
            }`}
          >
            {value?.split("\n")[0] ? (
              <span className="ph-no-capture min-w-16 placeholder w-full truncate break-all bg-transparent px-2 text-xs leading-tight text-bunker-300 outline-none duration-200 placeholder:text-bunker-400 focus:text-bunker-100 placeholder:focus:text-transparent">
                {value?.split("\n")[0]}
              </span>
            ) : (
              <span className="text-bunker-400">-</span>
            )}
            {value?.split("\n")[1] && (
              <span className="ph-no-capture min-w-16 placeholder w-full truncate break-all bg-transparent px-2 text-xs leading-tight text-bunker-300 outline-none duration-200 placeholder:text-bunker-400 focus:text-bunker-100 placeholder:focus:text-transparent">
                {value?.split("\n")[1]}
              </span>
            )}
          </div>
        </div>
      </PopoverObject>
    );
  }
  if (type === "value") {
    return (
      <div className="w-full flex-col">
        <div className="group relative flex	w-full flex-col justify-center whitespace-pre">
          {overrideEnabled === true && (
            <div className="absolute top-[0.1rem] right-[0.1rem] z-0 w-min rounded-sm bg-primary-500 px-1 text-xxs text-black opacity-80">
              Override enabled
            </div>
          )}
          <input
            value={value}
            onChange={(e) => onChangeHandler(e.target.value, id)}
            onScroll={syncScroll}
            className={`${
              blurred ? "text-transparent focus:text-transparent active:text-transparent" : ""
            } ph-no-capture min-w-16 no-scrollbar::-webkit-scrollbar peer z-10 w-full bg-transparent px-2 py-2 font-mono text-sm text-transparent caret-white outline-none duration-200 no-scrollbar`}
            spellCheck="false"
          />
          <div
            ref={ref}
            className={`${
              blurred && !overrideEnabled
                ? "text-bunker-800 duration-200 group-hover:text-gray-400 peer-focus:text-gray-100 peer-active:text-gray-400"
                : ""
            } ${overrideEnabled ? "text-primary-300" : "text-gray-400"}
            absolute z-0 flex flex-row whitespace-pre font-mono ${
              blurred ? "invisible" : "visible"
            } ph-no-capture min-w-16 no-scrollbar::-webkit-scrollbar mt-0.5 h-10 w-full overflow-x-scroll bg-transparent px-2 py-2 text-sm outline-none duration-100 no-scrollbar peer-focus:visible`}
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
            <div
              className={`peer absolute z-0 flex flex-row items-center justify-between pr-2 ${
                isSideBarOpen ? "bg-mineshaft-700 duration-200" : "bg-mineshaft-800"
              } h-10 w-full text-clip text-bunker-400 duration-100 group-hover:bg-white/[0.00] peer-focus:hidden peer-active:hidden`}
            >
              <div className="no-scrollbar::-webkit-scrollbar flex flex-row items-center overflow-x-scroll px-2 no-scrollbar">
                {value?.split("").map(() => (
                  <FontAwesomeIcon
                    key={guidGenerator()}
                    className="mr-0.5 text-xxs"
                    icon={faCircle}
                  />
                ))}
                {value?.split("").length === 0 && <span className="text-bunker-400/80">EMPTY</span>}
              </div>
              <div className="invisible z-[100] cursor-default group-hover:visible">
                <FontAwesomeIcon icon={faEye} />
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
    prev.id === next.id &&
    prev.blurred === next.blurred &&
    prev.isCapitalized === next.isCapitalized &&
    prev.overrideEnabled === next.overrideEnabled &&
    prev.isDuplicate === next.isDuplicate &&
    prev.isSideBarOpen === next.isSideBarOpen
  );
}

export default memo(DashboardInputField, inputPropsAreEqual);
