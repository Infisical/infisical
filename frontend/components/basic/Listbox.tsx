import React from "react";
import { Fragment } from "react";
import {
  faAngleDown,
  faCheck,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Listbox, Transition } from "@headlessui/react";

interface ListBoxProps {
  selected: string;
  onChange: () => void;
  data: string[];
  text: string;
  buttonAction: () => void;
  isFull?: boolean;
}

/**
 * This is the component that we use for drop down lists.
 * @param {object} obj
 * @param {string} obj.selected - the item that is currently selected
 * @param {function} obj.onChange - what happends if you select the item inside a list
 * @param {string[]} obj.data - all the options available
 * @param {string} obj.text - the text that shows us in front of the select option
 * @param {function} obj.buttonAction - if there is a button at the bottom of the list, this is the action that happens when you click the button
 * @param {string} obj.width - button width
 * @returns
 */
export default function ListBox({
  selected,
  onChange,
  data,
  text,
  buttonAction,
  isFull,
}: ListBoxProps): JSX.Element {
  return (
    <Listbox value={selected} onChange={onChange}>
      <div className="relative">
        <Listbox.Button
          className={`text-gray-400 relative ${
            isFull ? "w-full" : "w-52"
          } cursor-default rounded-md bg-white/[0.07] hover:bg-white/[0.11] duration-200 py-2.5 pl-3 pr-10 text-left shadow-md focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-orange-300 sm:text-sm`}
        >
          <div className="flex flex-row">
            {text}
            <span className="ml-1 cursor-pointer block truncate font-semibold text-gray-300">
              {" "}
              {selected}
            </span>
          </div>
          {data && (
            <div className="cursor-pointer pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
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
            <Listbox.Options className="border border-mineshaft-700 z-50 p-2 absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-bunker text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
              {data.map((person, personIdx) => (
                <Listbox.Option
                  key={personIdx}
                  className={({ active, selected }) =>
                    `my-0.5 relative cursor-default select-none py-2 pl-10 pr-4 rounded-md ${
                      selected ? "bg-white/10 text-gray-400 font-bold" : ""
                    } ${
                      active && !selected
                        ? "bg-white/5 text-mineshaft-200 cursor-pointer"
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
                        <span className="text-primary rounded-lg absolute inset-y-0 left-0 flex items-center pl-3">
                          <FontAwesomeIcon
                            icon={faCheck}
                            className="text-md ml-1"
                          />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
              {buttonAction && (
                <button
                  onClick={buttonAction}
                  className="cursor-pointer w-full"
                >
                  <div className="my-0.5 relative flex justify-start cursor-pointer select-none py-2 pl-10 pr-4 rounded-md text-gray-400 hover:bg-lime-300 duration-200 hover:text-black hover:font-semibold mt-2">
                    <span className="rounded-lg absolute inset-y-0 left-0 flex items-center pl-3 pr-4">
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
}
