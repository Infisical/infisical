import { Switch } from "@headlessui/react";
import { twMerge } from "tailwind-merge";

interface ToggleProps {
  className?: string;
  label?: string;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
}

/**
 * This is a typical 'iPhone' toggle (e.g., user for overriding secrets with personal values)
 * @param obj
 * @param {boolean} obj.enabled - whether the toggle is turned on or off
 * @param {number} obj.id - id of a certain secret
 * @returns
 */
const Toggle = ({ className, label, enabled, setEnabled }: ToggleProps): JSX.Element => {
  return (
    <Switch
      checked={enabled}
      onChange={() => {
        setEnabled(!enabled);
      }}
      className={twMerge(
        `${
          enabled ? "bg-primary" : "bg-bunker-400"
        } relative inline-flex h-5 w-9 items-center rounded-full`,
        className
      )}
    >
      {label ? <span className="sr-only">{label}</span> : null}
      <span
        className={`${
          enabled ? "translate-x-[1.26rem]" : "translate-x-0.5"
        } inline-block h-3.5 w-3.5 translate-x-0.5 transform rounded-full bg-bunker-800 transition`}
      />
    </Switch>
  );
};

export default Toggle;
