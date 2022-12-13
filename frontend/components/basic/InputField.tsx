import React, { useState } from 'react';
import { faCircle, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import guidGenerator from '../utilities/randomId';

interface InputFieldProps {
  static?: boolean;
  label: string;
  type: string;
  value: string;
  placeholder?: string;
  isRequired: boolean;
  disabled?: boolean;
  error?: boolean;
  text?: string;
  name?: string;
  blurred?: boolean;
  errorText?: string;
  onChangeHandler: (value: string) => void;
}

const InputField = (
  props: InputFieldProps &
    Pick<JSX.IntrinsicElements['input'], 'autoComplete' | 'id'>
) => {
  const [passwordVisible, setPasswordVisible] = useState(false);

  if (props.static === true) {
    return (
      <div className="flex flex-col my-2 md:my-4 justify-center w-full max-w-md">
        <p className="text-sm font-semibold text-gray-400 mb-0.5">
          {props.label}
        </p>
        {props.text && (
          <p className="text-xs text-gray-400 mb-2">{props.text}</p>
        )}
        <input
          onChange={(e) => props.onChangeHandler(e.target.value)}
          type={props.type}
          placeholder={props.placeholder}
          value={props.value}
          required={props.isRequired}
          className="bg-bunker-800 text-gray-400 border border-gray-600 rounded-md text-md p-2 w-full min-w-16 outline-none"
          name={props.name}
          readOnly
          autoComplete={props.autoComplete}
          id={props.id}
        />
      </div>
    );
  } else {
    return (
      <div className="flex-col w-full">
        <div className="flex flex-row text-mineshaft-300 items-center mb-0.5">
          <p className="text-sm font-semibold mr-1">{props.label}</p>
          {/* {props.label == "Password" && router.asPath != "/login" && (
						<div className="mb-0.5 relative inline-block text-gray-400 underline hover:text-primary duration-200">
							<FontAwesomeIcon
								icon={faCircleExclamation}
								className={`text-sm peer ${
									props.error && "text-red"
								}`}
							/>
							<span className="absolute hidden peer-hover:block duration-200 w-60 -left-28 -top-2 -translate-y-full px-2 py-2 bg-gray-700 rounded-md text-center text-gray-200 text-sm after:content-[''] after:absolute after:left-1/2 after:top-[100%] after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-gray-700">
								The password should contain at least 8
								characters including at least 1 lowercase
								character, uppercase character, number, and a
								special character.
							</span>
						</div>
					)} */}
        </div>
        <div
          className={`group relative flex flex-col justify-center w-full max-w-2xl border ${
            props.error ? 'border-red' : 'border-mineshaft-500'
          } rounded-md`}
        >
          <input
            onChange={(e) => props.onChangeHandler(e.target.value)}
            type={passwordVisible === false ? props.type : 'text'}
            placeholder={props.placeholder}
            value={props.value}
            required={props.isRequired}
            className={`${
              props.blurred
                ? 'text-bunker-800 group-hover:text-gray-400 focus:text-gray-400 active:text-gray-400'
                : ''
            } ${
              props.error ? 'focus:ring-red/50' : 'focus:ring-primary/50'
            } relative peer bg-bunker-800 rounded-md text-gray-400 text-md p-2 w-full min-w-16 outline-none focus:ring-4 duration-200`}
            name={props.name}
            spellCheck="false"
            autoComplete={props.autoComplete}
            id={props.id}
          />
          {props.label?.includes('Password') && (
            <button
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
          {props.blurred && (
            <div className="peer group-hover:hidden peer-hover:hidden peer-focus:hidden peer-active:invisible absolute h-10 w-fit max-w-xl rounded-md flex items-center text-gray-400/50 text-clip overflow-hidden">
              <p className="ml-2"></p>
              {props.value
                .split('')
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
          {/* {props.error && (
						<div className="absolute z-20 flex items-end justify-end mt-4 mr-1.5 self-end">
							<Error />
						</div>
					)} */}
        </div>
        {props.error && (
          <p className="text-red text-xs mt-0.5 mx-0 mb-2 max-w-xs">
            {props.errorText}
          </p>
        )}
      </div>
    );
  }
};

export default React.memo(InputField);
