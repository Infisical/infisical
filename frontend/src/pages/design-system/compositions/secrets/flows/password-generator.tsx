import { type ReactElement, useMemo, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@app/components/v4/ui/popover";
import { Slider } from "@app/components/v4/ui/slider";

import styles from "./password-generator.module.css";

const CHARSET = {
  useUppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  useLowercase: "abcdefghijklmnopqrstuvwxyz",
  useNumbers: "0123456789",
  useSpecialChars: "-_.~!*"
};
const OPTION_LABELS: [keyof typeof CHARSET, string][] = [
  ["useUppercase", "A-Z"],
  ["useLowercase", "a-z"],
  ["useNumbers", "0-9"],
  ["useSpecialChars", "-_.~!*"]
];

const generate = (length: number, options: Record<keyof typeof CHARSET, boolean>) => {
  const available =
    OPTION_LABELS.filter(([key]) => options[key])
      .map(([key]) => CHARSET[key])
      .join("") || CHARSET.useLowercase + CHARSET.useNumbers;
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (byte) => available[byte % available.length]).join("");
};

export function PasswordGenerator({
  trigger,
  disabled,
  minLength = 12,
  maxLength = 64,
  onUsePassword
}: {
  trigger: ReactElement;
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  onUsePassword: (password: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState(minLength);
  const [options, setOptions] = useState({
    useUppercase: true,
    useLowercase: true,
    useNumbers: true,
    useSpecialChars: true
  });
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState<"Copied" | "Copy failed">();
  const password = useMemo(() => generate(length, options), [length, options, refresh]);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(!disabled && next);
        setCopied(undefined);
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="end" className={styles.panel}>
        <PopoverHeader>
          <PopoverTitle>Generate random value</PopoverTitle>
          <PopoverDescription>Generate strong unique values</PopoverDescription>
        </PopoverHeader>
        <div className={styles.output}>
          <p className={styles.value}>{password}</p>
          <span className={styles.tools}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              iconOnly
              icon="sync"
              onClick={() => {
                setRefresh((current) => current + 1);
                setCopied(undefined);
              }}
            >
              Generate another value
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              iconOnly
              icon={copied === "Copied" ? "check" : "copy"}
              onClick={() =>
                navigator.clipboard
                  .writeText(password)
                  .then(() => setCopied("Copied"))
                  .catch(() => setCopied("Copy failed"))
              }
            >
              {copied ?? "Copy"}
            </Button>
          </span>
        </div>
        <div className={styles.length}>
          <span className={styles.lengthLabel} id="password-generator-length">
            {`Length: ${length}`}
          </span>
          <Slider
            min={minLength}
            max={maxLength}
            value={[length]}
            aria-labelledby="password-generator-length"
            onValueChange={([next]) => setLength(next)}
          />
        </div>
        <div className={styles.options}>
          {OPTION_LABELS.map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={options[key]}
              onCheckedChange={(checked) =>
                setOptions((current) => ({ ...current, [key]: checked === true }))
              }
            />
          ))}
        </div>
        <Button
          type="button"
          onClick={() => {
            onUsePassword(password);
            setOpen(false);
          }}
        >
          Use value
        </Button>
      </PopoverContent>
    </Popover>
  );
}
