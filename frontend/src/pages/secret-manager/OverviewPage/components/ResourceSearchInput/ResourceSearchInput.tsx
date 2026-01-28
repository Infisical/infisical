import { useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableButtonGroup,
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
        <Tooltip>
          <TooltipTrigger asChild>
            <UnstableIconButton variant="outline" onClick={() => setIsOpen(true)}>
              <SearchIcon />
            </UnstableIconButton>
          </TooltipTrigger>
          <TooltipContent>Deep search</TooltipContent>
        </Tooltip>
        <InputGroup className="w-[270px]">
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
