import React from 'react';
import { Fragment } from 'react';
import { useTranslation } from "next-i18next";
import {
  faAngleDown,
  faEye,
  faPlus,
  faShuffle,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Listbox, Transition } from '@headlessui/react';

interface ListBoxProps {
  selected: string;
  select: (event: string) => void;
}

const eventOptions = [
  {
    name: 'addSecrets',
    icon: faPlus
  },
  {
    name: 'readSecrets',
    icon: faEye
  },
  {
    name: 'updateSecrets',
    icon: faShuffle
  }
];

/**
 * This is the component that we use for the event picker in the activity logs tab.
 * @param {object} obj
 * @param {string} obj.selected - the event that is currently selected
 * @param {function} obj.select - an action that happens when an item is selected
 */
export default function EventFilter({
  selected,
  select
}: ListBoxProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <Listbox value={t("activity:event." + selected)} onChange={select}>
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
                    selected == t("activity:event." + event.name) && 'bg-mineshaft-700'
                  }`}
                  value={t("activity:event." + event.name)}
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? 'font-semibold' : 'font-normal'
                        }`}
                      >
                        <FontAwesomeIcon icon={event.icon} className="pr-4" />{' '}
                        {t("activity:event." + event.name)}
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
