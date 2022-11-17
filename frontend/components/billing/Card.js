import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { faCcMastercard, faCcVisa } from "@fortawesome/free-brands-svg-icons";
import { faCircle } from "@fortawesome/free-solid-svg-icons";

export default function Card({ card, changeSelectedCard, selected }) {
	function creditCardBrandIcon(cc) {
		if (cc == "visa") {
			return faCcVisa;
		} else if ((cc = "mastercard")) {
			return faCcMastercard;
		} else return faQuestionCircle;
	}

	return (
		<button onClick={() => changeSelectedCard(card.id)}>
			<div
				className={`flex flex-col p-3 items-start justify-between mr-2 w-52 h-28 bg-primary/5 rounded-lg duration-200 ${
					card.id == selected
						? "border-primary text-primary"
						: "border-gray-500 text-gray-300"
				} hover:border-primary border-2 hover:text-primary cursor-pointer`}
			>
				<div className="flex flex-row items-center justify-between w-full">
					<FontAwesomeIcon
						className="text-3xl mr-4"
						icon={creditCardBrandIcon(card.card.brand)}
					/>
					{card.id == selected && (
						<FontAwesomeIcon
							className="text-xl ml-2 mr-2"
							icon={faCheck}
						/>
					)}
				</div>
				<div className="flex flex-row items-center justify-between w-full">
					<div className="flex flex-row items-center">
						<p className="tracking-tighter mr-1 mt-0.5 flex">
							{"****".split("").map(() => (
								<FontAwesomeIcon
									className="text-xxxs mr-0.5"
									icon={faCircle}
								/>
							))}
						</p>
						<p className="tracking-tighter mr-1 mt-0.5 flex">
							{"****".split("").map(() => (
								<FontAwesomeIcon
									className="text-xxxs mr-0.5"
									icon={faCircle}
								/>
							))}
						</p>
						<p className="tracking-tighter mr-1 mt-0.5 flex">
							{"****".split("").map(() => (
								<FontAwesomeIcon
									className="text-xxxs mr-0.5"
									icon={faCircle}
								/>
							))}
						</p>
						<p className="text-xs">{card.card.last4}</p>
					</div>
					<p className="text-xs">
						{card.card.exp_month + "/" + card.card.exp_year}
					</p>
				</div>
			</div>
		</button>
	);
}
