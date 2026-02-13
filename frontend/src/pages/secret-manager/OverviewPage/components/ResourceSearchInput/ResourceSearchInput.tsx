import { useState } from "react";
import { ChevronDown, FolderIcon, GlobeIcon, SearchIcon, XIcon } from "lucide-react";

import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  UnstableButtonGroup,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";

import { QuickSearchModal, QuickSearchModalProps } from "../SecretSearchInput/components";

type Props = Omit<QuickSearchModalProps, "isOpen" | "onClose" | "onOpenChange" | "initialValue"> & {
  value: string;
  onChange: (search: string) => void;
  className?: string;
};

export const ResourceSearchInput = ({
  value,
  onChange,
  className,
  isSingleEnv,
  ...props
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasSearch = Boolean(value.trim());

  return (
    <>
      <UnstableButtonGroup>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <Button variant="outline">
              <FolderIcon className="text-folder" />
              Current
              <ChevronDown className="text-accent" />
            </Button>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="start">
            <UnstableDropdownMenuItem>
              <FolderIcon className="text-folder" />
              Current Folder
            </UnstableDropdownMenuItem>
            <UnstableDropdownMenuItem onClick={() => setIsOpen(true)}>
              <GlobeIcon className="text-folder" />
              All Folders
            </UnstableDropdownMenuItem>
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
        <InputGroup className="w-[270px]">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            autoComplete="off"
            placeholder={
              isSingleEnv
                ? "Search by secret, folder, tag or metadata..."
                : "Search by secret or folder name..."
            }
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
          {hasSearch && (
            <InputGroupAddon align="inline-end">
              <UnstableIconButton variant="ghost" size="xs" onClick={() => onChange("")}>
                <XIcon />
              </UnstableIconButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </UnstableButtonGroup>
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
    </>
  );
};
