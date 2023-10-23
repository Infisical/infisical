import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

export const WarningMessage = ({text}: {text: string}): JSX.Element => {
    return (
    <div>
        <div className="flex flex-col bg-mineshaft-800 border border-mineshaft-600 w-full p-4 max-w-lg mt-6 rounded-md">
            <div className="flex flex-row items-center">
                <FontAwesomeIcon icon={faCircleExclamation} className="text-mineshaft-200 text-xl" style={{color: "yellow"}}/>
                <span className="ml-3 text-sm text-mineshaft-100" style={{color: "yellow"}}> {text}
                </span>
            </div>
        </div>
    </div>
    );
}