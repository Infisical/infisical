import { useState } from "react";
import { faCircleXmark, faFolderTree, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Combobox, Transition } from "@headlessui/react";
import { twMerge } from "tailwind-merge";

import { IconButton, Tooltip } from "@app/components/v2";

import { QuickSearchModal, QuickSearchModalProps } from "./components";

type ModalProps = Omit<
  QuickSearchModalProps,
  "isOpen" | "onClose" | "onOpenChange" | "initialValue"
> & {
  value: string;
  onChange: (search: string) => void;
  className?: string;
};

export const SecretSearchInput = ({
  value,
  onChange,
  className,
  isSingleEnv,
  ...props
}: ModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasSearch = Boolean(value.trim());

  return (
    <div className={twMerge("relative w-80", className)}>
      <Combobox
        // keeps combobox from internally controlling state, hacky use of combobox
        value={undefined}
      >
        {({ activeIndex }) => (
          <>
            <div className="flex w-full items-center whitespace-nowrap">
              <Tooltip content="Search Options">
                <Combobox.Button className="button user-select-none relative inline-flex h-[2.42rem] cursor-pointer items-center justify-center rounded-md rounded-r-none border border-mineshaft-600 bg-mineshaft-600 p-3 font-inter text-sm font-medium text-bunker-200 transition-all duration-100 hover:border-primary-400/50 hover:bg-primary/[0.1] hover:text-bunker-100">
                  <FontAwesomeIcon
                    icon={faSearch}
                    size="sm"
                    className={hasSearch ? "text-primary" : ""}
                    aria-hidden="true"
                  />
                </Combobox.Button>
              </Tooltip>
              <div className="relative inline-flex w-full items-center rounded-md rounded-l-none border border-mineshaft-500 bg-bunker-800 font-inter text-gray-400">
                <Combobox.Input
                  onKeyDown={(e) => {
                    if (activeIndex === 0 && e.key === "Enter") setIsOpen(true);
                  }}
                  autoComplete="off"
                  className="input text-md h-[2.3rem] w-full rounded-md rounded-l-none bg-mineshaft-800 py-[0.375rem] pl-2.5 pr-8 text-gray-400 placeholder-mineshaft-50 placeholder-opacity-50 outline-none duration-200 placeholder:text-sm hover:ring-bunker-400/60 focus:bg-mineshaft-700/80 focus:ring-1 focus:ring-primary-400/50"
                  placeholder="Search by secret, folder, tag or metadata..."
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
                {hasSearch && (
                  <IconButton
                    isRounded
                    variant="plain"
                    onClick={() => onChange("")}
                    className="absolute right-2 text-primary"
                    ariaLabel="Clear search"
                  >
                    <FontAwesomeIcon icon={faCircleXmark} />
                  </IconButton>
                )}
              </div>
            </div>
            <Transition
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Combobox.Options className="absolute z-30 mt-2 w-full min-w-[220px] overflow-y-auto rounded-md border border-mineshaft-600 bg-mineshaft-900 text-bunker-300 shadow focus:outline-none">
                <Combobox.Option
                  onClick={() => setIsOpen(true)}
                  value={value}
                  className={({ active }) =>
                    `flex w-full cursor-pointer items-start rounded-sm px-4 py-2 font-inter text-sm text-mineshaft-200 outline-none hover:bg-mineshaft-400 ${
                      active ? "bg-mineshaft-500" : ""
                    }`
                  }
                >
                  <FontAwesomeIcon icon={faFolderTree} className="mr-2 mt-1 text-yellow-700" />
                  {value.trim()
                    ? `Search for "${
                        value.length > 10 ? `${value.substring(0, 10)}...` : value
                      }" in all folders`
                    : "Search in all folders"}
                </Combobox.Option>
              </Combobox.Options>
            </Transition>
          </>
        )}
      </Combobox>
      <QuickSearchModal
        isSingleEnv={isSingleEnv}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        initialValue={value}
        onClose={() => {
          setIsOpen(false);
          onChange("");
        }}
        {...props}
      />
    </div>
  );
};
