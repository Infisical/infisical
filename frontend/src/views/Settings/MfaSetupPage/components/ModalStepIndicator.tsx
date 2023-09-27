import { FC } from "react";
import { faShield } from "@fortawesome/free-solid-svg-icons"; 
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface ModalStepIndicatorProps {
  active: boolean;
  stepNumber: string;
  done?: boolean
}

export const ModalStepIndicator: FC<ModalStepIndicatorProps> = ({ active, done, stepNumber }) => {
  const circleColorClass = active || done ? "bg-blue-600" : "bg-gray-400"; 
  const shieldIconColor = "text-white";

  return (
    <div className="relative w-20 h-20 flex items-center justify-center font-bold m-1">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center ${circleColorClass}`}>
        <FontAwesomeIcon icon={faShield} className={`text-3xl ${shieldIconColor}`} />
        <div className="absolute text-lg">{stepNumber}</div>
      </div>
      {active && (
        <div className="absolute w-1 bg-blue-600 left-1/2 transform -translate-x-1/2 h-10 top-1/2 -translate-y-5" />
      )}
    </div>
  );
};
