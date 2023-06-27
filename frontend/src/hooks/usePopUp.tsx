import { useCallback, useState } from "react";

interface UsePopUpProps {
  name: Readonly<string>;
  isOpen: boolean;
}

/**
 * to provide better intellisense
 * checks which type of inputProps were given and converts them into key-names
 * SIDENOTE: On inputting give it as const and not string with (as const)
 */
export type UsePopUpState<T extends Readonly<string[]> | UsePopUpProps[]> = {
  [P in T extends UsePopUpProps[] ? T[number]["name"] : T[number]]: {
    isOpen: boolean;
    data?: unknown;
  };
};

export interface UsePopUpReturn<T extends Readonly<string[]> | UsePopUpProps[]> {
  popUp: UsePopUpState<T>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<T>, data?: unknown) => void;
  handlePopUpClose: (popUpName: keyof UsePopUpState<T>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<T>, state?: boolean) => void;
}

/**
 * This hook is used to manage multiple popUps/modal/dialog in a page
 * Provides api to open,close,toggle and also store temporary data for the popUp
 * @param popUpNames: the names of popUp containers eg: ["popUp1","second"] or [{name:"popUp2",isOpen:bool}]
 */
export const usePopUp = <T extends Readonly<string[]> | UsePopUpProps[]>(
  popUpNames: T
): UsePopUpReturn<T> => {
  const [popUp, setPopUp] = useState<UsePopUpState<T>>(
    Object.fromEntries(
      popUpNames.map((popUpName) =>
        typeof popUpName === "string"
          ? [popUpName, { isOpen: false }]
          : [popUpName.name, { isOpen: popUpName.isOpen }]
      ) // convert into an array of [[popUpName,state]] then into Object
    ) as UsePopUpState<T> // to override generic string return type of the function
  );

  const handlePopUpOpen = useCallback((popUpName: keyof UsePopUpState<T>, data?: unknown) => {
    setPopUp((oldState) => ({ ...oldState, [popUpName]: { isOpen: true, data } }));
  }, []);

  const handlePopUpClose = useCallback((popUpName: keyof UsePopUpState<T>) => {
    setPopUp((oldState) => ({ ...oldState, [popUpName]: { isOpen: false } }));
  }, []);

  const handlePopUpToggle = useCallback((popUpName: keyof UsePopUpState<T>, state?: boolean) => {
    setPopUp((oldState) => ({
      ...oldState,
      [popUpName]: { isOpen: typeof state === "undefined" ? !oldState[popUpName].isOpen : state }
    }));
  }, []);

  return {
    popUp,
    handlePopUpOpen,
    handlePopUpClose,
    handlePopUpToggle
  };
};
