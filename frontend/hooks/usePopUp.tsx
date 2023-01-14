import { useCallback, useState } from 'react';

interface usePopUpProps {
  name: Readonly<string>;
  isOpen: boolean;
}

/**
 * to provide better intellisense
 * checks which type of inputProps were given and converts them into key-names
 * SIDENOTE: On inputting give it as const and not string with (as const)
 */
type usePopUpState<T extends Readonly<string[]> | usePopUpProps[]> = {
  [P in T extends usePopUpProps[] ? T[number]['name'] : T[number]]: {
    isOpen: boolean;
    data?: unknown;
  };
};

interface usePopUpReturn<T extends Readonly<string[]> | usePopUpProps[]> {
  popUp: usePopUpState<T>;
  handlePopUpOpen: (popUpName: keyof usePopUpState<T>, data?: unknown) => void;
  handlePopUpClose: (popUpName: keyof usePopUpState<T>) => void;
  handlePopUpToggle: (popUpName: keyof usePopUpState<T>) => void;
}

/**
 * This hook is used to manage multiple popUps/modal/dialog in a page
 * Provides api to open,close,toggle and also store temporary data for the popUp
 * @param popUpNames: the names of popUp containers eg: ["popUp1","second"] or [{name:"popUp2",isOpen:bool}]
 */
export const usePopUp = <T extends Readonly<string[]> | usePopUpProps[]>(
  popUpNames: T
): usePopUpReturn<T> => {
  const [popUp, setPopUp] = useState<usePopUpState<T>>(
    Object.fromEntries(
      popUpNames.map((popUpName) =>
        typeof popUpName === 'string'
          ? [popUpName, { isOpen: false }]
          : [popUpName.name, { isOpen: popUpName.isOpen }]
      ) // convert into an array of [[popUpName,state]] then into Object
    ) as usePopUpState<T> // to override generic string return type of the function
  );

  const handlePopUpOpen = useCallback(
    (popUpName: keyof usePopUpState<T>, data?: unknown) => {
      setPopUp((popUp) => ({ ...popUp, [popUpName]: { isOpen: true, data } }));
    },
    []
  );

  const handlePopUpClose = useCallback((popUpName: keyof usePopUpState<T>) => {
    setPopUp((popUp) => ({ ...popUp, [popUpName]: { isOpen: false } }));
  }, []);

  const handlePopUpToggle = useCallback((popUpName: keyof usePopUpState<T>) => {
    setPopUp((popUp) => ({
      ...popUp,
      [popUpName]: { isOpen: !popUp[popUpName].isOpen },
    }));
  }, []);

  return {
    popUp,
    handlePopUpOpen,
    handlePopUpClose,
    handlePopUpToggle,
  };
};
