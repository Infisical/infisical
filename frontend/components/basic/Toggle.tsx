import React from "react";
import { Switch } from "@headlessui/react";


interface OverrideProps {
  id: string;
  keyName: string;
  value: string;
  pos: number;
  comment: string;
}

interface ToggleProps { 
  enabled: boolean; 
  setEnabled: (value: boolean) => void; 
  addOverride: (value: OverrideProps) => void; 
  keyName: string;
  value: string;
  pos: number;
  id: string;
  comment: string;
  deleteOverride: (id: string) => void; 
  sharedToHide: string[];
  setSharedToHide: (values: string[]) => void;
}

/**
 * This is a typical 'iPhone' toggle (e.g., user for overriding secrets with personal values)
 * @param obj 
 * @param {boolean} obj.enabled - whether the toggle is turned on or off
 * @param {function} obj.setEnabled - change the state of the toggle
 * @param {function} obj.addOverride - a function that adds an override to a certain secret
 * @param {string} obj.keyName - key of a certain secret
 * @param {string} obj.value - value of a certain secret
 * @param {number} obj.pos - position of a certain secret
 #TODO: make the secret id persistent?
 * @param {string} obj.id - id of a certain secret (NOTE: THIS IS THE ID OF THE MAIN SECRET - NOT OF AN OVERRIDE)
 * @param {function} obj.deleteOverride - a function that deleted an override for a certain secret
 * @param {string[]} obj.sharedToHide - an array of shared secrets that we want to hide visually because they are overriden. 
 * @param {function} obj.setSharedToHide - a function that updates the array of secrets that we want to hide visually
 * @returns 
 */
export default function Toggle ({ 
  enabled, 
  setEnabled, 
  addOverride, 
  keyName, 
  value, 
  pos, 
  id, 
  comment,
  deleteOverride,
  sharedToHide,
  setSharedToHide
}: ToggleProps): JSX.Element {
  return (
    <Switch
      checked={enabled}
      onChange={() => {
        if (enabled == false) {
          addOverride({ id, keyName, value, pos, comment });
          setSharedToHide([
            ...sharedToHide!,
            id
          ])
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
