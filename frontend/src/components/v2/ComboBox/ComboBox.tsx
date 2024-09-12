import { useState } from "react";
import { faCaretDown, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Combobox, Transition } from "@headlessui/react";
import { ByComparator } from "@headlessui/react/dist/types";
import { twMerge } from "tailwind-merge";

type ComboBoxProps<T extends object> = {
  value?: T;
  className?: string;
  items: {
    value: T;
    key: string;
    label: string;
  }[];
  by: ByComparator<T>;
  defaultValue?: T;
  displayValue: (value: T) => string;
  onSelectChange: (value: T) => void;
  onFilter: (value: { value: T }, filterQuery: string) => boolean;
};

// TODO(akhilmhdh): This is a very temporary one due to limitation of present situation
// don't mind the api for now will be switched to aria later
export const ComboBox = <T extends object>({
  onSelectChange,
  onFilter,
  displayValue,
  by,
  items,
  ...props
}: ComboBoxProps<T>) => {
  const [query, setQuery] = useState("");

  const filteredResult =
    query === "" ? items.slice(0, 20) : items.filter((el) => onFilter(el, query)).slice(0, 20);

  return (
    <Combobox by={by} {...props} onChange={onSelectChange}>
      <div className="relative">
        <Combobox.Input
          onChange={(event) => setQuery(event.target.value)}
          displayValue={displayValue}
          className=" inline-flex w-full items-center justify-between rounded-md bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none focus:bg-mineshaft-700/80 data-[placeholder]:text-mineshaft-200"
        />
        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
          <FontAwesomeIcon icon={faCaretDown} size="sm" aria-hidden="true" />
        </Combobox.Button>
        <Transition
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          afterLeave={() => setQuery("")}
        >
          <Combobox.Options className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md  bg-mineshaft-900 py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
            {filteredResult.map(({ value, key, label }) => (
              <Combobox.Option
                key={key}
                value={value}
                className={({ active }) =>
                  `relative cursor-pointer  select-none py-2 pl-10 pr-4 transition-all hover:bg-mineshaft-500 ${
                    active ? "text-primary" : "text-white"
                  }`
                }
              >
                {({ selected }) => (
                  <>
                    {label}
                    {selected ? (
                      <div className={twMerge("absolute top-2 left-3 text-primary")}>
                        <FontAwesomeIcon icon={faCheck} />
                      </div>
                    ) : null}
                  </>
                )}
              </Combobox.Option>
            ))}
          </Combobox.Options>
        </Transition>
      </div>
    </Combobox>
  );
};
