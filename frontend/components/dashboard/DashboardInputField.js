import React, { Fragment } from "react";
import { faCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import guidGenerator from "../utilities/randomId";

/**
 * This function splits the input of a dashboard field into the parts that are inside and outside of ${...}
 * @param {string} text - the value of the input in the Dashboard Input Field
 * @returns
 */
const findReferences = (text) => {
	var splitText = text.split("${");
	let textArray = [splitText[0]];
	for (var i = 1; i < splitText.length; i++) {
		let insideBrackets = "${" + splitText[i].split("}")[0];
		if (splitText[i].includes("}")) {
			insideBrackets += "}";
		}
		textArray.push(insideBrackets);
		textArray.push(splitText[i].split("}")[1]);
	}
	return textArray;
};

/**
 * This component renders the input fields on the dashboard
 * @param {object} obj - the order number of a keyPair
 * @param {number} obj.index - the order number of a keyPair
 * @param {function} obj.onChangeHandler - what happens when the input is modified
 * @param {string} obj.type - whether the input field is for a Key Name or for a Key Value
 * @param {string} obj.value - value of the InputField
 * @param {boolean} obj.blurred - whether the input field should be blurred (behind the gray dots) or not; this can be turned on/off in the dashboard
 * @returns
 */
const DashboardInputField = ({
	index,
	onChangeHandler,
	type,
	value,
	blurred,
}) => {
	if (type === "varName") {
		return (
			<div className="flex-col w-full">
				<div
					className={`group relative flex flex-col justify-center w-full max-w-2xl border border-mineshaft-500 rounded-md`}
				>
					<input
						onChange={(e) => onChangeHandler(e.target.value, index)}
						type={type}
						value={value}
						className="asolute z-10 peer font-mono ph-no-capture bg-bunker-800 rounded-md caret-white text-gray-400 text-md px-2 py-1.5 w-full min-w-16 outline-none focus:ring-4 focus:ring-primary/50 duration-200"
						spellCheck="false"
					/>
				</div>
			</div>
		);
	} else if (type === "value") {
		return (
			<div className="flex-col w-full">
				<div
					className={`group relative flex flex-col justify-center w-full max-w-2xl border border-mineshaft-500 rounded-md`}
				>
					<input
						onChange={(e) => onChangeHandler(e.target.value, index)}
						type={type}
						value={value}
						className={`${
							blurred
								? "text-transparent group-hover:text-transparent focus:text-transparent active:text-transparent"
								: ""
						} asolute z-10 peer font-mono ph-no-capture bg-transparent rounded-md caret-white text-transparent text-md px-2 py-1.5 w-full min-w-16 outline-none focus:ring-4 focus:ring-primary/50 duration-200`}
						spellCheck="false"
					/>
					<div
						className={`${
							blurred
								? "text-bunker-800 group-hover:text-gray-400 peer-focus:text-gray-400 peer-active:text-gray-400"
								: ""
						} flex flex-row font-mono absolute z-0 ph-no-capture bg-bunker-800 rounded-md text-gray-400 text-md px-2 py-1.5 w-full min-w-16 outline-none focus:ring-4 focus:ring-primary/50 duration-100`}
					>
						{findReferences(value).map((texts, id) => {
							if (id % 2 == 0 || texts.length <= 2) {
								return (
									<span className="ph-no-capture" key={id}>
										{texts}
									</span>
								);
							}
							return (
								<span
									className="ph-no-capture text-yellow"
									key={id}
								>
									{texts.slice(0, 2)}
									<span className="ph-no-capture text-yellow-200/80">
										{texts.slice(2, texts.length - 1)}
									</span>
									{texts.slice(
										texts.length - 1,
										texts.length
									) == "}" ? (
										<span className="ph-no-capture text-yellow">
											{texts.slice(
												texts.length - 1,
												texts.length
											)}{" "}
										</span>
									) : (
										<span className="ph-no-capture text-yellow-400">
											{texts.slice(
												texts.length - 1,
												texts.length
											)}{" "}
										</span>
									)}
								</span>
							);
						})}
					</div>
					{blurred && (
						<div className="z-20 peer pr-2 bg-bunker-800 group-hover:hidden peer-hover:hidden peer-focus:hidden peer-active:invisible absolute h-9 w-fit max-w-xl rounded-md flex items-center text-gray-400/50 text-clip overflow-hidden">
							<p className="ml-2"></p>
							{value
								.split("")
								.slice(0, 42)
								.map(() => (
									<FontAwesomeIcon
										key={guidGenerator()}
										className="text-xxs mx-0.5"
										icon={faCircle}
									/>
								))}
						</div>
					)}
				</div>
			</div>
		);
	}
};

export default React.memo(DashboardInputField);
