import { Switch } from "@headlessui/react";

interface ToggleProps {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  addOverride: (value: string | undefined, id: string) => void;
  id: string;
}

/**
 * This is a typical 'iPhone' toggle (e.g., user for overriding secrets with personal values)
 * @param obj
 * @param {boolean} obj.enabled - whether the toggle is turned on or off
 * @param {function} obj.setEnabled - change the state of the toggle
 * @param {function} obj.addOverride - a function that adds an override to a certain secret
 * @param {number} obj.id - id of a certain secret
 * @returns
 */
const Toggle = ({ enabled, setEnabled, addOverride, id }: ToggleProps): JSX.Element => {
  return (
    <Switch
      checked={enabled}
      onChange={() => {
        if (enabled === false) {
          addOverride("", id);
        } else {
          addOverride(undefined, id);
        }
        setEnabled(!enabled);
      }}
      className={`${
        enabled ? "bg-primary" : "bg-bunker-400"
      } relative inline-flex h-5 w-9 items-center rounded-full`}
    >
      <span className="sr-only">Enable notifications</span>
      <span
        className={`${
          enabled ? "translate-x-[1.26rem]" : "translate-x-0.5"
        } inline-block h-3.5 w-3.5 transform rounded-full bg-bunker-800 transition`}
      />
    </Switch>
  );
};

export default Toggle;
