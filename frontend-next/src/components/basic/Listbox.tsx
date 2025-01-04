import React, { Fragment } from "react";
import { faAngleDown, faCheck, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Listbox, Transition } from "@headlessui/react";

interface ListBoxProps {
  isSelected: string;
  onChange: (arg: string) => void;
  data: string[] | null;
  text?: string;
  buttonAction?: () => void;
  isFull?: boolean;
}

/**
 * This is the component that we use for drop down lists.
 * @param {object} obj
 * @param {string} obj.isSelected - the item that is currently selected
 * @param {function} obj.onChange - what happends if you select the item inside a list
 * @param {string[]} obj.data - all the options available
 * @param {string} obj.text - the text that shows us in front of the select option
 * @param {function} obj.buttonAction - if there is a button at the bottom of the list, this is the action that happens when you click the button
 * @returns
 */
const ListBox = ({
  isSelected,
  onChange,
  data,
  text,
  buttonAction,
  isFull
}: ListBoxProps): JSX.Element => {
  return (
    <Listbox value={isSelected} onChange={onChange}>
      <div className="relative">
        <Listbox.Button
          className={`relative text-gray-400 ${
            isFull ? "w-full" : "w-52"
          } focus-visible:ring-offset-orange-300 cursor-default rounded-md bg-white/[0.07] py-2.5 pl-3 pr-10 text-left shadow-md duration-200 hover:bg-white/[0.11] focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 sm:text-sm`}
        >
          <div className="flex flex-row">
            {text}
            <span className="ml-1 block cursor-pointer truncate font-semibold text-gray-300">
              {" "}
              {isSelected}
            </span>
          </div>
          {data && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex cursor-pointer items-center pr-2">
              <FontAwesomeIcon icon={faAngleDown} className="text-md mr-1.5" />
            </div>
          )}
        </Listbox.Button>
        {data && (
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="no-scrollbar::-webkit-scrollbar absolute z-[70] mt-1 max-h-60 w-full overflow-auto rounded-md border border-mineshaft-700 bg-bunker p-2 text-base shadow-lg ring-1 ring-black ring-opacity-5 no-scrollbar focus:outline-none sm:text-sm">
              {data.map((person, personIdx) => (
                <Listbox.Option
                  key={`${person}.${personIdx + 1}`}
                  className={({ active, selected }) =>
                    `relative my-0.5 cursor-default select-none rounded-md py-2 pl-10 pr-4 ${
                      selected ? "bg-white/10 font-bold text-gray-400" : ""
                    } ${
                      active && !selected
                        ? "cursor-pointer bg-white/5 text-mineshaft-200"
                        : "text-gray-400"
                    } `
                  }
                  value={person}
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate text-primary${
                          selected ? "font-medium" : "font-normal"
                        }`}
                      >
                        {person}
                      </span>
                      {selected ? (
                        <span className="absolute inset-y-0 left-0 flex items-center rounded-lg pl-3 text-primary">
                          <FontAwesomeIcon icon={faCheck} className="text-md ml-1" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
              {buttonAction && (
                <button type="button" onClick={buttonAction} className="w-full cursor-pointer">
                  <div className="relative my-0.5 mt-2 flex cursor-pointer select-none justify-start rounded-md py-2 pl-10 pr-4 text-gray-400 duration-200 hover:bg-lime-300 hover:font-semibold hover:text-black">
                    <span className="absolute inset-y-0 left-0 flex items-center rounded-lg pl-3 pr-4">
                      <FontAwesomeIcon icon={faPlus} className="text-lg" />
                    </span>
                    Add Project
                  </div>
                </button>
              )}
            </Listbox.Options>
          </Transition>
        )}
      </div>
    </Listbox>
  );
};

export default ListBox;
