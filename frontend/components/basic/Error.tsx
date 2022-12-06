import React from "react";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function Error({ text }: { text: string }): JSX.Element {
  return (
    <div className="relative bg-red-500 opacity-100 border flex flex-row justify-center m-auto items-center w-fit rounded-full mb-4">
      <FontAwesomeIcon
        icon={faExclamationTriangle}
        className="text-white mt-1.5 mb-2 mx-2"
      />
      {text && (
        <p className="relative top-0 text-white mr-2 text-sm py-1">{text}</p>
      )}
    </div>
  );
}
