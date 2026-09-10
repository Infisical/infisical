import { useState } from "react";
import { faCircleXmark, faFolderTree, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Combobox, Transition } from "@headlessui/react";
import { twMerge } from "tailwind-merge";

import { IconButton, Tooltip } from "@app/components/v2";

import { QuickSearchModal, QuickSearchModalProps } from "./components";

type ModalProps = Omit<
  QuickSearchModalProps,
  "isOpen" | "onClose" | "onOpenChange" | "initialValue" | "onSelectResult"
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
                <Combobox.Button className="button user-select-none relative inline-flex h-[2.42rem] cursor-pointer items-center justify-center rounded-md rounded-r-none border border-border-control bg-surface-active p-3 font-inter text-sm font-medium text-foreground-soft transition-all duration-100 hover:border-project/50 hover:bg-project/10 hover:text-foreground-default">
                  <FontAwesomeIcon
                    icon={faSearch}
                    size="sm"
                    className={hasSearch ? "text-project" : ""}
                    aria-hidden="true"
                  />
                </Combobox.Button>
              </Tooltip>
              <div className="relative inline-flex w-full items-center rounded-md rounded-l-none border border-border-strong bg-page font-inter text-muted-cool">
                <Combobox.Input
                  onKeyDown={(e) => {
                    if (activeIndex === 0 && e.key === "Enter") setIsOpen(true);
                  }}
                  autoComplete="off"
                  className={twMerge(
                    "input text-md h-[2.3rem] w-full rounded-md rounded-l-none bg-surface-raised py-1.5 pl-2.5 text-muted-cool outline-hidden duration-200 placeholder:text-sm placeholder:text-foreground-bright/50 hover:ring-muted-secondary/60 focus:bg-surface-hover/80 focus:ring-1 focus:ring-project/50",
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
                    className="absolute right-2 text-project"
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
              <Combobox.Options className="absolute z-30 mt-2 w-full min-w-[220px] overflow-y-auto rounded-md border border-border-control bg-surface-base text-label-secondary shadow-sm focus:outline-hidden">
                <Combobox.Option
                  onClick={() => setIsOpen(true)}
                  value={value}
                  className={({ active }) =>
                    `flex w-full cursor-pointer items-start rounded-xs px-4 py-2 font-inter text-sm text-foreground-secondary outline-hidden hover:bg-muted ${
                      active ? "bg-surface-selected" : ""
                    }`
                  }
                >
                  <FontAwesomeIcon icon={faFolderTree} className="mt-1 mr-2 text-warning" />
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
        onSelectResult={({ search }) => onChange(search)}
        onClose={(clearSearch = true) => {
          setIsOpen(false);
          if (clearSearch) onChange("");
        }}
        {...props}
      />
    </div>
  );
};
