import { memo, useState } from "react";
import { faCircle, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import guidGenerator from "../utilities/randomId";

interface InputFieldProps {
  isStatic?: boolean;
  label: string;
  type: string;
  value: string;
  placeholder?: string;
  isRequired: boolean;
  error?: boolean;
  text?: string;
  name?: string;
  blurred?: boolean;
  errorText?: string;
  onChangeHandler: (value: string) => void;
}

const InputField = ({
  isRequired,
  label,
  onChangeHandler,
  type,
  value,
  autoComplete,
  blurred,
  error,
  errorText,
  id,
  name,
  placeholder,
  isStatic,
  text
}: InputFieldProps & Pick<JSX.IntrinsicElements["input"], "autoComplete" | "id">) => {
  const [passwordVisible, setPasswordVisible] = useState(false);

  if (isStatic === true) {
    return (
      <div className="my-2 flex w-full max-w-md flex-col justify-center md:my-4">
        <p className="mb-0.5 text-sm font-semibold text-gray-400">{label}</p>
        {text && <p className="mb-2 text-xs text-gray-400">{text}</p>}
        <input
          onChange={(e) => onChangeHandler(e.target.value)}
          type={type}
          placeholder={placeholder}
          value={value}
          required={isRequired}
          className="text-md w-full min-w-16 rounded-md border border-gray-600 bg-bunker-800 p-2 text-gray-400 outline-none"
          name={name}
          readOnly
          autoComplete={autoComplete}
          id={id}
        />
      </div>
    );
  }
  return (
    <div className="w-full flex-col">
      <div className="mb-0.5 flex flex-row items-center text-mineshaft-300">
        <p className="mr-1 text-sm font-semibold">{label}</p>
      </div>
      <div
        className={`group relative flex w-full max-w-2xl flex-col justify-center border ${
          error ? "border-red" : "border-mineshaft-500"
        } rounded-md`}
      >
        <input
          onChange={(e) => onChangeHandler(e.target.value)}
          type={passwordVisible === false ? type : "text"}
          placeholder={placeholder}
          value={value}
          required={isRequired}
          className={`${
            blurred
              ? "text-bunker-800 focus:text-gray-400 active:text-gray-400 group-hover:text-gray-400"
              : ""
          } ${
            error ? "focus:ring-red/50" : "focus:ring-primary/50"
          } text-md peer relative w-full min-w-16 rounded-md bg-mineshaft-900 p-2 text-gray-400 outline-none duration-200 focus:ring-4`}
          name={name}
          spellCheck="false"
          autoComplete={autoComplete}
          id={id}
        />
        {label?.includes("Password") && (
          <button
            type="button"
            onClick={() => {
              setPasswordVisible(!passwordVisible);
            }}
            className="absolute mr-3 cursor-pointer self-end text-gray-400"
          >
            {passwordVisible ? (
              <FontAwesomeIcon icon={faEyeSlash} />
            ) : (
              <FontAwesomeIcon icon={faEye} />
            )}
          </button>
        )}
        {blurred && (
          <div className="peer absolute flex h-10 w-fit max-w-xl items-center overflow-hidden text-clip rounded-md text-gray-400/50 group-hover:hidden peer-hover:hidden peer-focus:hidden peer-active:invisible">
            <p className="ml-2" />
            {value
              .split("")
              .slice(0, 54)
              .map(() => (
                <FontAwesomeIcon
                  key={guidGenerator()}
                  className="mx-0.5 text-xxs"
                  icon={faCircle}
                />
              ))}
          </div>
        )}
        {/* {error && (
						<div className="absolute z-20 flex items-end justify-end mt-4 mr-1.5 self-end">
							<Error />
						</div>
					)} */}
      </div>
      {error && <p className="mx-0 mb-2 mt-0.5 max-w-xs text-xs text-red">{errorText}</p>}
    </div>
  );
};

export default memo(InputField);
