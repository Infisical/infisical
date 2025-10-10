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
                <Combobox.Button className="button user-select-none border-mineshaft-600 bg-mineshaft-600 font-inter text-bunker-200 hover:border-primary-400/50 hover:bg-primary/10 hover:text-bunker-100 relative inline-flex h-[2.42rem] cursor-pointer items-center justify-center rounded-md rounded-r-none border p-3 text-sm font-medium transition-all duration-100">
                  <FontAwesomeIcon
                    icon={faSearch}
                    size="sm"
                    className={hasSearch ? "text-primary" : ""}
                    aria-hidden="true"
                  />
                </Combobox.Button>
              </Tooltip>
              <div className="border-mineshaft-500 bg-bunker-800 font-inter relative inline-flex w-full items-center rounded-md rounded-l-none border text-gray-400">
                <Combobox.Input
                  onKeyDown={(e) => {
                    if (activeIndex === 0 && e.key === "Enter") setIsOpen(true);
                  }}
                  autoComplete="off"
                  className={twMerge(
                    "input text-md bg-mineshaft-800 placeholder-mineshaft-50/50 outline-hidden hover:ring-bunker-400/60 focus:bg-mineshaft-700/80 focus:ring-primary-400/50 h-[2.3rem] w-full rounded-md rounded-l-none py-1.5 pl-2.5 text-gray-400 duration-200 placeholder:text-sm focus:ring-1",
                    hasSearch ? "pr-8" : "pr-2.5"
                  )}
                  placeholder={
                    isSingleEnv
                      ? "Search by secret, folder, tag or metadata..."
                      : "Search by secret or folder name..."
                  }
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
                {hasSearch && (
                  <IconButton
                    isRounded
                    variant="plain"
                    onClick={() => onChange("")}
                    className="text-primary absolute right-2"
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
              <Combobox.Options className="border-mineshaft-600 bg-mineshaft-900 text-bunker-300 focus:outline-hidden absolute z-30 mt-2 w-full min-w-[220px] overflow-y-auto rounded-md border shadow-sm">
                <Combobox.Option
                  onClick={() => setIsOpen(true)}
                  value={value}
                  className={({ active }) =>
                    `rounded-xs font-inter text-mineshaft-200 outline-hidden hover:bg-mineshaft-400 flex w-full cursor-pointer items-start px-4 py-2 text-sm ${
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
