import React from "react";
import Image from "next/image";
import Link from "next/link";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

var classNames = require("classnames");

export default function Button({
	text,
	onButtonPressed,
	link,
	loading,
	color,
	size,
	icon,
	active = true,
	iconDisabled,
	textDisabled
}) {
	let styleButton = classNames(
		"group m-auto md:m-0 inline-block rounded-md duration-200",

		// Setting background colors and hover modes
		color == "mineshaft" && active && "bg-mineshaft-700 hover:bg-primary",
		color == "mineshaft" && !active && "bg-mineshaft",
		(color == "primary" || !color) && active && "bg-primary hover:opacity-80",
		(color == "primary" || !color) && !active && "bg-primary",
		color == "red" && "bg-red",
		
		// Changing the opacity when active vs when not
		active ? "opacity-100 cursor-pointer" : "opacity-40",

		// Setting the button sizes
		size == "md" && "h-10 w-full px-2 md:px-4",
		size == "lg" && "h-12 w-full px-2 md:px-8",
		!size && "md:py-1 px-3 md:px-8",
		size == "icon-md" && "h-10 w-10 flex items-center justify-center",
		size == "icon-sm" && "h-9 w-9 flex items-center justify-center",
	);

	let styleMainDiv = classNames(
		"relative font-medium flex items-center",

		// Setting the text color for the text and icon
		color == "mineshaft" && "text-gray-400",
		color != "mineshaft" && color != "red" && "text-black",
		color == "red" && "text-gray-200",
		active && color != "red" ? "group-hover:text-black" : "",

		size == "icon" && "flex items-center justify-center",
	);

	let textStyle = classNames(
		"relative duration-200",

		// Show the loading sign if the loading indicator is on
		loading == true ? "opacity-0" : "opacity-100",
		size == "md" && "text-sm",
		size == "lg" && "text-lg"
	);

	const button = (
		<button 
			disabled={!active}
			onClick={onButtonPressed}
			className={styleButton}
		>
			<div className={styleMainDiv}>
				<div
					className={`${
						loading == true ? "opacity-100" : "opacity-0"
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
				{icon && 
					<FontAwesomeIcon
						icon={icon}
						className={`flex my-auto font-extrabold ${size == "icon-sm" ? "text-sm" : "text-md"} ${(text || textDisabled) && "mr-2"}`}
					/>
				}
				{iconDisabled && 
					<FontAwesomeIcon
						icon={iconDisabled}
						className={`flex my-auto font-extrabold ${size == "icon-sm" ? "text-sm" : "text-md"} ${(text || textDisabled) && "mr-2"}`}
					/>
				}
				{(text || textDisabled) &&
					<p
						className={textStyle}
					>
						{active ? text : textDisabled}
					</p>
				}
			</div>
		</button>
	);

	if (link) {
		return <Link href={link}>{button}</Link>;
	}

	return button;
}
