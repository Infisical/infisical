import React, { Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  faAngleDown,
  faEye,
  faPlus,
  faShuffle,
  faTrash,
  faX
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Listbox, Transition } from "@headlessui/react";

interface ListBoxProps {
  selected: string;
  select: (event: string) => void;
}

const eventOptions = [
  {
    name: "addSecrets",
    icon: faPlus
  },
  {
    name: "readSecrets",
    icon: faEye
  },
  {
    name: "updateSecrets",
    icon: faShuffle
  },
  {
    name: "deleteSecrets",
    icon: faTrash
  }
];

/**
 * This is the component that we use for the event picker in the activity logs tab.
 * @param {object} obj
 * @param {string} obj.selected - the event that is currently selected
 * @param {function} obj.select - an action that happens when an item is selected
 */
const EventFilter = ({ selected, select }: ListBoxProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <Listbox value={t(`activity.event.${selected}`)} onChange={select}>
      <div className="relative">
        <Listbox.Button className="flex h-10 w-52 cursor-pointer items-center justify-between rounded-md bg-mineshaft-800 pl-4 pr-2 text-sm text-bunker-200 duration-200 hover:bg-mineshaft-700">
          {selected !== "" ? (
            <p className="select-none text-bunker-100">{t(`activity.event.${selected}`)}</p>
          ) : (
            <p className="select-none">{String(t("common.select-event"))}</p>
          )}
          {selected !== "" ? (
            <FontAwesomeIcon icon={faX} className="w-2 p-2 pl-2" onClick={() => select("")} />
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
          <Listbox.Options className="absolute z-50 mt-1 max-h-60 w-52 overflow-auto rounded-md border border-mineshaft-700 bg-bunker p-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {eventOptions.map((event, id) => (
              <Listbox.Option
                key={`${event.name}.${id + 1}`}
                className={`flex h-10 cursor-pointer items-center rounded-md px-4 text-sm text-bunker-200 hover:bg-mineshaft-700 ${
                  selected === t(`activity.event.${event.name}`) && "bg-mineshaft-700"
                }`}
                value={event.name}
              >
                {({ selected: isSelected }) => (
                  <span
                    className={`block truncate ${isSelected ? "font-semibold" : "font-normal"}`}
                  >
                    <FontAwesomeIcon icon={event.icon} className="pr-4" />{" "}
                    {t(`activity.event.${event.name}`)}
                  </span>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
};

export default EventFilter;
