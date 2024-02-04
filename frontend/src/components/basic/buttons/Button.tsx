/* eslint-disable react/button-has-type */
import React, { ButtonHTMLAttributes } from "react";
import Image from "next/image";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const classNames = require("classnames");

type ButtonProps = {
  text?: string;
  onButtonPressed: () => void;
  loading?: boolean;
  color?: string;
  size: string;
  icon?: IconProp;
  active?: boolean;
  iconDisabled?: IconProp;
  textDisabled?: string;
  type?: ButtonHTMLAttributes<any>["type"];
};

/**
 * This is the main butto component in the app.
 * @param {object} props
 * @param {string} props.text - text inside the button
 * @param {function} props.onButtonPressed - the action that happens when the button is clicked
 * @param {boolean} props.loading - if a button is currently in the laoding state
 * @param {string} props.color - button color
 * @param {string} props.size - button size
 * @param {FontAwesomeIconProps} props.icon - the icon inside the button
 * @param {boolean} props.active - if the button is active or disabled
 * @param {FontAwesomeIconProps} props.text - the icon inside the button when it is disabled
 * @param {string} props.textDisable - text inside the button when it is disabled
 * @returns
 */
const Button = ({
  active,
  text,
  textDisabled,
  color,
  size,
  onButtonPressed,
  loading,
  icon,
  iconDisabled,
  type = "button",
}: ButtonProps): JSX.Element => {
  // Check if the button show always be 'active' - then true;
  // or if it should switch between 'active' and 'disabled' - then give the status
  const activityStatus = active || (text !== "" && textDisabled === undefined);

  const styleButton = classNames(
    "group m-auto md:m-0 inline-block rounded-md duration-200",

    // Setting background colors and hover modes
    color === "mineshaft" && activityStatus && "bg-mineshaft-800 border border-mineshaft-600 hover:bg-primary/[0.15] hover:border-primary/60",
    color === "mineshaft" && !activityStatus && "bg-mineshaft",
    (color === "primary" || !color) && activityStatus && "bg-primary border border-primary-400 opacity-80 hover:opacity-100",
    (color === "primary" || !color) && !activityStatus && "bg-primary",
    color === "red" && "bg-red-800 border border-red",

    // Changing the opacity when active vs when not
    activityStatus ? "opacity-100 cursor-pointer" : "opacity-40",

    // Setting the button sizes
    size === "md" && "h-10 w-full px-2 md:px-4",
    size === "lg" && "h-12 w-full px-2 md:px-8",
    !size && "md:py-1 px-3 md:px-8",
    size === "icon-md" && "h-10 w-10 flex items-center justify-center",
    size === "icon-sm" && "h-9 w-9 flex items-center justify-center"
  );

  const styleMainDiv = classNames(
    "relative font-medium flex items-center",

    // Setting the text color for the text and icon
    color === "mineshaft" && "text-bunker-200",
    color !== "mineshaft" && color !== "red" && color !== "none" && "text-black",
    color === "red" && "text-gray-200",
    color === "none" && "text-gray-200 text-xl",
    activityStatus && color !== "red" && color !== "mineshaft" && color !== "none" ? "group-hover:text-black" : "",

    size === "icon" && "flex items-center justify-center"
  );

  const textStyle = classNames(
    "relative duration-200 text-center w-full",

    // Show the loading sign if the loading indicator is on
    loading ? "opacity-0" : "opacity-100",
    size === "md" && "text-sm",
    size === "lg" && "text-lg"
  );

  const button = (
    <button
      disabled={!activityStatus}
      type={type}
      onClick={onButtonPressed}
      className={styleButton}
    >
      <div className={styleMainDiv}>
        <div
          className={`${
            loading === true ? "opacity-100" : "opacity-0"
          } absolute flex items-center px-3 bg-primary duration-200 w-full`}
        >
          <Image
            src="/images/loading/loadingblack.gif"
            height={25}
            width={42}
            alt="loading animation"
            className="rounded-xl"
          />
        </div>
        {icon && (
          <FontAwesomeIcon
            icon={icon}
            className={`flex my-auto font-extrabold ${size === "icon-sm" ? "text-sm" : "text-sm"} ${
              (text || textDisabled) && "mr-2"
            }`}
          />
        )}
        {iconDisabled && (
          <FontAwesomeIcon
            icon={iconDisabled as IconProp}
            className={`flex my-auto font-extrabold ${size === "icon-sm" ? "text-sm" : "text-md"} ${
              (text || textDisabled) && "mr-2"
            }`}
          />
        )}
        {(text || textDisabled) && (
          <p className={textStyle}>{activityStatus ? text : textDisabled}</p>
        )}
      </div>
    </button>
  );

  return button;
};

export default Button;
