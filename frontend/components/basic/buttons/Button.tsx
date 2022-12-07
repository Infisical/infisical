import React from "react";
import Image from "next/image";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  FontAwesomeIcon,
  FontAwesomeIconProps,
} from "@fortawesome/react-fontawesome";

const classNames = require("classnames");

type ButtonProps = {
  text: string;
  onButtonPressed: () => void;
  loading?: boolean;
  color?: string;
  size: string;
  icon?: IconProp;
  active?: boolean;
  iconDisabled?: string;
  textDisabled?: string;
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
export default function Button(props: ButtonProps): JSX.Element {
  // Check if the button show always be 'active' - then true;
  // or if it should switch between 'active' and 'disabled' - then give the status
  const activityStatus =
    props.active || (props.text != "" && props.textDisabled == undefined);

  const styleButton = classNames(
    "group m-auto md:m-0 inline-block rounded-md duration-200",

    // Setting background colors and hover modes
    props.color == "mineshaft" &&
      activityStatus &&
      "bg-mineshaft-700 hover:bg-primary",
    props.color == "mineshaft" && !activityStatus && "bg-mineshaft",
    (props.color == "primary" || !props.color) &&
      activityStatus &&
      "bg-primary hover:opacity-80",
    (props.color == "primary" || !props.color) &&
      !activityStatus &&
      "bg-primary",
    props.color == "red" && "bg-red",

    // Changing the opacity when active vs when not
    activityStatus ? "opacity-100 cursor-pointer" : "opacity-40",

    // Setting the button sizes
    props.size == "md" && "h-10 w-full px-2 md:px-4",
    props.size == "lg" && "h-12 w-full px-2 md:px-8",
    !props.size && "md:py-1 px-3 md:px-8",
    props.size == "icon-md" && "h-10 w-10 flex items-center justify-center",
    props.size == "icon-sm" && "h-9 w-9 flex items-center justify-center"
  );

  const styleMainDiv = classNames(
    "relative font-medium flex items-center",

    // Setting the text color for the text and icon
    props.color == "mineshaft" && "text-gray-400",
    props.color != "mineshaft" && props.color != "red" && "text-black",
    props.color == "red" && "text-gray-200",
    activityStatus && props.color != "red" ? "group-hover:text-black" : "",

    props.size == "icon" && "flex items-center justify-center"
  );

  const textStyle = classNames(
    "relative duration-200",

    // Show the loading sign if the loading indicator is on
    props.loading ? "opacity-0" : "opacity-100",
    props.size == "md" && "text-sm",
    props.size == "lg" && "text-lg"
  );

  const button = (
    <button
      disabled={!activityStatus}
      onClick={props.onButtonPressed}
      className={styleButton}
    >
      <div className={styleMainDiv}>
        <div
          className={`${
            props.loading == true ? "opacity-100" : "opacity-0"
          } absolute flex items-center px-2 duration-200`}
        >
          <Image
            src="/images/loading/loadingblack.gif"
            height={25}
            width={42}
            alt="loading animation"
            className={`rounded-xl`}
          ></Image>
        </div>
        {props.icon && (
          <FontAwesomeIcon
            icon={props.icon}
            className={`flex my-auto font-extrabold ${
              props.size == "icon-sm" ? "text-sm" : "text-md"
            } ${(props.text || props.textDisabled) && "mr-2"}`}
          />
        )}
        {props.iconDisabled && (
          <FontAwesomeIcon
            icon={props.iconDisabled as IconProp}
            className={`flex my-auto font-extrabold ${
              props.size == "icon-sm" ? "text-sm" : "text-md"
            } ${(props.text || props.textDisabled) && "mr-2"}`}
          />
        )}
        {(props.text || props.textDisabled) && (
          <p className={textStyle}>
            {activityStatus ? props.text : props.textDisabled}
          </p>
        )}
      </div>
    </button>
  );

  return button;
}
