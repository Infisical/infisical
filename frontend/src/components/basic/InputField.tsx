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
        <p className="mb-0.5 text-sm font-medium text-muted-cool">{label}</p>
        {text && <p className="mb-2 text-xs text-muted-cool">{text}</p>}
        <input
          onChange={(e) => onChangeHandler(e.target.value)}
          type={type}
          placeholder={placeholder}
          value={value}
          required={isRequired}
          className="text-md w-full min-w-16 rounded-md border border-border-cool-strong bg-page p-2 text-muted-cool outline-hidden"
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
      <div className="mb-0.5 flex flex-row items-center text-label">
        <p className="mr-1 text-sm font-medium">{label}</p>
      </div>
      <div
        className={`group relative flex w-full max-w-2xl flex-col justify-center border ${
          error ? "border-danger" : "border-border-strong"
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
              ? "text-page group-hover:text-muted-cool focus:text-muted-cool active:text-muted-cool"
              : ""
          } ${
            error ? "focus:ring-danger/50" : "focus:ring-project/50"
          } text-md peer relative w-full min-w-16 rounded-md bg-surface-base p-2 text-muted-cool outline-hidden duration-200 focus:ring-4`}
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
            className="absolute mr-3 cursor-pointer self-end text-muted-cool"
          >
            {passwordVisible ? (
              <FontAwesomeIcon icon={faEyeSlash} />
            ) : (
              <FontAwesomeIcon icon={faEye} />
            )}
          </button>
        )}
        {blurred && (
          <div className="peer absolute flex h-10 w-fit max-w-xl items-center overflow-hidden rounded-md text-clip text-muted-cool/50 group-hover:!hidden peer-hover:hidden peer-focus:hidden peer-active:invisible">
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
      {error && <p className="mx-0 mt-0.5 mb-2 max-w-xs text-xs text-danger">{errorText}</p>}
    </div>
  );
};

export default memo(InputField);
