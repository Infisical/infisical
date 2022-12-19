import React from 'react';
import { Fragment } from 'react';
import {
  faAngleDown,
  faCheck,
  faDownload,
  faPlus,
  faUpload,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Listbox, Transition } from '@headlessui/react';

import guidGenerator from '../utilities/randomId';
import Button from './buttons/Button';

interface ListBoxProps {
  selected: string;
  select: (event: string) => void;
  data: string[];
  text?: string;
  buttonAction?: () => void;
  isFull?: boolean;
}

const eventOptions = [
  {
    name: 'Secrets Pushed',
    icon: faUpload
  },
  {
    name: 'Secrets Pulled',
    icon: faDownload
  }
];

/**
 * This is the component that we use for drop down lists.
 * @param {object} obj
 * @param {string} obj.selected - the item that is currently selected
 * @param {function} obj.select - what happends if you select the item inside a list
 * @param {string[]} obj.data - all the options available
 * @param {string} obj.text - the text that shows us in front of the select option
 * @param {function} obj.buttonAction - if there is a button at the bottom of the list, this is the action that happens when you click the button
 * @param {string} obj.width - button width
 * @returns
 */
export default function EventFilter({
  selected,
  select,
  data,
  text,
  buttonAction,
  isFull
}: ListBoxProps): JSX.Element {
  return (
    <Listbox value={selected} onChange={select}>
      <div className="relative">
        <Listbox.Button className="bg-mineshaft-800 hover:bg-mineshaft-700 duration-200 cursor-pointer rounded-md h-10 flex items-center justify-between pl-4 pr-2 w-52 text-bunker-200 text-sm">
          {selected != '' ? (
            <p className="select-none text-bunker-100">{selected}</p>
          ) : (
            <p className="select-none">Select an event</p>
          )}
          {selected != '' ? (
            <FontAwesomeIcon
              icon={faX}
              className="pl-2 w-2 p-2"
              onClick={() => select('')}
            />
          ) : (
            <FontAwesomeIcon icon={faAngleDown} className="pl-4 pr-2" />
          )}
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="border border-mineshaft-700 z-50 w-52 p-1 absolute mt-1 max-h-60 overflow-auto rounded-md bg-bunker text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {eventOptions.map((event, id) => {
              return (
                <Listbox.Option
                  key={id}
                  className={`px-4 h-10 flex items-center text-sm cursor-pointer hover:bg-mineshaft-700 text-bunker-200 rounded-md ${
                    selected == event.name && 'bg-mineshaft-700'
                  }`}
                  value={event.name}
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? 'font-semibold' : 'font-normal'
                        }`}
                      >
                        <FontAwesomeIcon icon={event.icon} className="pr-4" />{' '}
                        {event.name}
                      </span>
                    </>
                  )}
                  {/* <FontAwesomeIcon icon={event.icon} className="pr-4" /> {event.name} */}
                </Listbox.Option>
              );
            })}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}
