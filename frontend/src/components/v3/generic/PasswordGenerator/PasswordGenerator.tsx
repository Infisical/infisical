import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, RefreshCwIcon } from "lucide-react";

import { useTimedReset } from "@app/hooks";

import { Button } from "../Button";
import { Checkbox } from "../Checkbox";
import { UnstableIconButton } from "../IconButton";
import { Label } from "../Label";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";

type PasswordOptionsType = {
  length: number;
  useUppercase: boolean;
  useLowercase: boolean;
  useNumbers: boolean;
  useSpecialChars: boolean;
};

export type PasswordGeneratorProps = {
  onUsePassword?: (password: string) => void;
  isDisabled?: boolean;
  minLength?: number;
  maxLength?: number;
};

export const PasswordGenerator = ({
  onUsePassword,
  isDisabled = false,
  minLength = 12,
  maxLength = 64
}: PasswordGeneratorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy"
  });
  const [refresh, setRefresh] = useState(false);
  const [passwordOptions, setPasswordOptions] = useState<PasswordOptionsType>({
    length: minLength,
    useUppercase: true,
    useLowercase: true,
    useNumbers: true,
    useSpecialChars: true
  });

  const password = useMemo(() => {
    const charset = {
      uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      lowercase: "abcdefghijklmnopqrstuvwxyz",
      numbers: "0123456789",
      specialChars: "-_.~!*"
    };

    let availableChars = "";
    if (passwordOptions.useUppercase) availableChars += charset.uppercase;
    if (passwordOptions.useLowercase) availableChars += charset.lowercase;
    if (passwordOptions.useNumbers) availableChars += charset.numbers;
    if (passwordOptions.useSpecialChars) availableChars += charset.specialChars;

    if (availableChars === "") availableChars = charset.lowercase + charset.numbers;

    const randomBytes = new Uint32Array(passwordOptions.length);
    crypto.getRandomValues(randomBytes);
    let newPassword = "";
    for (let i = 0; i < passwordOptions.length; i += 1) {
      newPassword += availableChars[randomBytes[i] % availableChars.length];
    }

    return newPassword;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordOptions, refresh]);

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(password)
      .then(() => {
        setCopyText("Copied");
      })
      .catch(() => {
        setCopyText("Copy failed");
      });
  };

  const usePassword = () => {
    onUsePassword?.(password);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <UnstableIconButton variant="outline" size="md" isDisabled={isDisabled}>
          <KeyRoundIcon />
        </UnstableIconButton>
      </PopoverTrigger>
      <PopoverContent className="w-[30rem]" align="end">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium">Generate Random Value</p>
            <p className="mt-0.5 text-xs text-muted">Generate strong unique values</p>
          </div>

          <div className="rounded-md border border-border bg-container/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex-1 font-mono text-sm break-all select-all">{password}</p>
              <div className="flex shrink-0 gap-1">
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => setRefresh((prev) => !prev)}
                >
                  <RefreshCwIcon />
                </UnstableIconButton>
                <UnstableIconButton variant="ghost" size="xs" onClick={copyToClipboard}>
                  {isCopying ? <CheckIcon /> : <CopyIcon />}
                </UnstableIconButton>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs text-accent">Length: {passwordOptions.length}</Label>
            </div>
            <input
              type="range"
              min={minLength}
              max={maxLength}
              value={passwordOptions.length}
              onChange={(e) =>
                setPasswordOptions({ ...passwordOptions, length: Number(e.target.value) })
              }
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-project [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm"
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                variant="project"
                isChecked={passwordOptions.useUppercase}
                onCheckedChange={(checked) =>
                  setPasswordOptions({ ...passwordOptions, useUppercase: checked as boolean })
                }
              />
              A-Z
            </Label>
            <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                variant="project"
                isChecked={passwordOptions.useLowercase}
                onCheckedChange={(checked) =>
                  setPasswordOptions({ ...passwordOptions, useLowercase: checked as boolean })
                }
              />
              a-z
            </Label>
            <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                variant="project"
                isChecked={passwordOptions.useNumbers}
                onCheckedChange={(checked) =>
                  setPasswordOptions({ ...passwordOptions, useNumbers: checked as boolean })
                }
              />
              0-9
            </Label>
            <Label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                variant="project"
                isChecked={passwordOptions.useSpecialChars}
                onCheckedChange={(checked) =>
                  setPasswordOptions({ ...passwordOptions, useSpecialChars: checked as boolean })
                }
              />
              -_.~!*
            </Label>
          </div>

          {onUsePassword && (
            <Button variant="project" size="xs" onClick={usePassword} className="w-full">
              Use Value
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
