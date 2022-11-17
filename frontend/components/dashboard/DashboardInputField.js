import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircle } from "@fortawesome/free-solid-svg-icons";
import guidGenerator from "../utilities/randomId";


const DashboardInputField = ({label, index, onChangeHandler, type, value, placeholder, isRequired, blurred, isStatic}) => {
	if (isStatic === true) {
		return (
			<div className="flex flex-col my-2 md:my-4 justify-center w-full max-w-md">
				<p className="text-sm font-semibold text-gray-400 mb-0.5">
					{label}
				</p>
				{text && (
					<p className="text-xs text-gray-400 mb-2">{text}</p>
				)}
				<input
					onChange={(e) => console.log(e.target.value, index)}
					type={type}
					placeholder={placeholder}
					value={value}
					required={isRequired}
					className="bg-bunker-800 text-gray-400 border border-gray-600 rounded-md text-md p-2 w-full min-w-16 outline-none"
					readOnly
				/>
			</div>
		);
	} else {
		return (
			<div className="flex-col w-full">
				<div
					className={`group flex flex-col justify-center w-full max-w-2xl border border-mineshaft-500 rounded-md`}
				>
					<input
						onChange={(e) => onChangeHandler(e.target.value, index)}
						type={type}
						placeholder={placeholder}
						value={value}
						required={isRequired}
						className={`${
							blurred
								? "text-bunker-800 group-hover:text-gray-400 focus:text-gray-400 active:text-gray-400"
								: ""
						} peer ph-no-capture bg-bunker-800 rounded-md text-gray-400 text-md px-2 py-1.5 w-full min-w-16 outline-none focus:ring-4 focus:ring-primary/50 duration-200`}
						spellCheck="false"
					/>
					{blurred && (
						<div className="peer pr-24 group-hover:hidden peer-hover:hidden peer-focus:hidden peer-active:invisible absolute h-10 w-fit max-w-xl rounded-md flex items-center text-gray-400/50 text-clip overflow-hidden">
							<p className="ml-2"></p>
							{value
								.split("")
								.slice(0,42)
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
