import React from "react";
import { Switch } from "@headlessui/react";


interface OverrideProps {
  id: string;
  keyName: string;
  value: string;
  pos: number;
}

interface ToggleProps { 
  enabled: boolean; 
  setEnabled: (value: boolean) => void; 
  addOverride: (value: OverrideProps) => void; 
  keyName: string;
  value: string;
  pos: number;
  id: string;
  deleteOverride: (id: string) => void; 
}

/**
 * This is a typical 'iPhone' toggle (e.g., user for overriding secrets with personal values)
 * @param obj 
 * @param {boolean} obj.enabled - whether the toggle is turned on or off
 * @param {function} obj.setEnabled - change the state of the toggle
 * @returns 
 */
export default function Toggle ({ enabled, setEnabled, addOverride, keyName, value, pos, id, deleteOverride }: ToggleProps): JSX.Element {
  return (
    <Switch
      checked={enabled}
      onChange={() => {
        if (enabled == false) {
          addOverride({ id, keyName, value, pos });
        } else {
          deleteOverride(id);
        }
        setEnabled(!enabled);
      }}
      className={`${
        enabled ? 'bg-primary' : 'bg-bunker-400'
      } relative inline-flex h-5 w-9 items-center rounded-full`}
    >
      <span className="sr-only">Enable notifications</span>
      <span
        className={`${
          enabled ? 'translate-x-[1.26rem]' : 'translate-x-0.5'
        } inline-block h-3.5 w-3.5 transform rounded-full bg-bunker-800 transition`}
      />
    </Switch>
  )
}
