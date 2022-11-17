import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	faXmark,
} from "@fortawesome/free-solid-svg-icons";

export default function BottonRightPopup({
	buttonText,
	buttonLink,
	titleText,
	emoji,
	textLine1,
	textLine2,
	setCheckDocsPopUpVisible
}) {
	return (
		<div class="z-50 drop-shadow-xl border-gray-600/50 border flex flex-col items-start bg-bunker max-w-xl text-gray-200 pt-3 pb-4 rounded-xl absolute bottom-0 right-0 mr-6 mb-6" role="alert">
			<div className="flex flex-row items-center justify-between w-full border-b border-gray-600/70 pb-3 px-6">
				<div className="font-bold text-xl mr-2 mt-0.5 flex flex-row">
					<div>{titleText}</div>
					<div class="ml-2.5">{emoji}</div>
				</div>
				<button className="mt-1" onClick={() => setCheckDocsPopUpVisible(false)}>
					<FontAwesomeIcon icon={faXmark} className="text-gray-400 text-2xl hover:text-red duration-200 cursor-pointer" />
				</button>
			</div>
			<div class="block sm:inline px-6 mt-4 mb-0.5 text-gray-300">{textLine1}</div>
			<div class="block sm:inline mb-4 px-6">{textLine2}</div>
			<div className="flex flex-row px-6 w-full">
				<a
					class="font-bold p-2 bg-white/10 rounded-md w-full hover:bg-primary duration-200 hover:text-black flex justify-center"
					href={buttonLink}
					target="_blank"
					rel="noopener"
				>
					{buttonText}
				</a>
			</div>
		</div>
	);
}
