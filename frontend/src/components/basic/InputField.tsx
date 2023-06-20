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
      <div className="flex flex-col my-2 md:my-4 justify-center w-full max-w-md">
        <p className="text-sm font-semibold text-gray-400 mb-0.5">{label}</p>
        {text && <p className="text-xs text-gray-400 mb-2">{text}</p>}
        <input
          onChange={(e) => onChangeHandler(e.target.value)}
          type={type}
          placeholder={placeholder}
          value={value}
          required={isRequired}
          className="bg-bunker-800 text-gray-400 border border-gray-600 rounded-md text-md p-2 w-full min-w-16 outline-none"
          name={name}
          readOnly
          autoComplete={autoComplete}
          id={id}
        />
      </div>
    );
  }
  return (
    <div className="flex-col w-full">
      <div className="flex flex-row text-mineshaft-300 items-center mb-0.5">
        <p className="text-sm font-semibold mr-1">{label}</p>
      </div>
      <div
        className={`group relative flex flex-col justify-center w-full max-w-2xl border ${
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
              ? "text-bunker-800 group-hover:text-gray-400 focus:text-gray-400 active:text-gray-400"
              : ""
          } ${
            error ? "focus:ring-red/50" : "focus:ring-primary/50"
          } relative peer bg-mineshaft-900 rounded-md text-gray-400 text-md p-2 w-full min-w-16 outline-none focus:ring-4 duration-200`}
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
            className="absolute self-end mr-3 text-gray-400 cursor-pointer"
          >
            {passwordVisible ? (
              <FontAwesomeIcon icon={faEyeSlash} />
            ) : (
              <FontAwesomeIcon icon={faEye} />
            )}
          </button>
        )}
        {blurred && (
          <div className="peer group-hover:hidden peer-hover:hidden peer-focus:hidden peer-active:invisible absolute h-10 w-fit max-w-xl rounded-md flex items-center text-gray-400/50 text-clip overflow-hidden">
            <p className="ml-2" />
            {value
              .split("")
              .slice(0, 54)
              .map(() => (
                <FontAwesomeIcon
                  key={guidGenerator()}
                  className="text-xxs mx-0.5"
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
      {error && <p className="text-red text-xs mt-0.5 mx-0 mb-2 max-w-xs">{errorText}</p>}
    </div>
  );
};

export default memo(InputField);
