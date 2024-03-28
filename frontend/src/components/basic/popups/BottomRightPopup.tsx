import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface PopupProps {
  buttonText: string;
  buttonLink: string;
  titleText: string;
  emoji: string;
  textLine1: string;
  textLine2: string;
  setCheckDocsPopUpVisible: (value: boolean) => void;
}

/**
 * This is the notification that pops up at the bottom right when a user performs a certain action
 * @param {object} org
 * @param {string} org.buttonText - text of the button inside the notification
 * @param {string} org.buttonLink - where the button leads to
 * @param {string} org.titleText - the text at the top of a notification
 * @param {string} org.emoji - the emoji in the notification title
 * @param {string} org.textLine1 - first line of the text in the notification
 * @param {string} org.textLine2 - second line of the text in the notification
 * @param {string} org.setCheckDocsPopUpVisible - the functions that closes the popup
 * @returns
 */
const BottonRightPopup = ({
  buttonText,
  buttonLink,
  titleText,
  emoji,
  textLine1,
  textLine2,
  setCheckDocsPopUpVisible
}: PopupProps): JSX.Element => {
  return (
    <div
      className="absolute bottom-0 right-0 z-[100] mr-6 mb-6 flex max-w-xl flex-col items-start rounded-md border border-gray-600/50 bg-bunker pt-3 pb-4 text-gray-200 drop-shadow-xl"
      role="alert"
    >
      <div className="flex w-full flex-row items-center justify-between border-b border-gray-600/70 px-6 pb-3">
        <div className="mr-2 mt-0.5 flex flex-row text-xl font-bold">
          <div>{titleText}</div>
          <div className="ml-2.5">{emoji}</div>
        </div>
        <button className="mt-1" onClick={() => setCheckDocsPopUpVisible(false)} type="button">
          <FontAwesomeIcon
            icon={faXmark}
            className="cursor-pointer text-2xl text-gray-400 duration-200 hover:text-red"
          />
        </button>
      </div>
      <div className="mt-4 mb-0.5 block px-6 text-gray-300 sm:inline">{textLine1}</div>
      <div className="mb-4 block px-6 sm:inline">{textLine2}</div>
      <div className="flex w-full flex-row px-6">
        {/* eslint-disable-next-line react/jsx-no-target-blank */}
        <a
          className="flex w-full justify-center rounded-md bg-white/10 p-2 font-bold duration-200 hover:bg-primary hover:text-black"
          href={buttonLink}
          target="_blank"
          rel="noopener"
        >
          {buttonText}
        </a>
      </div>
    </div>
  );
};

export default BottonRightPopup;
