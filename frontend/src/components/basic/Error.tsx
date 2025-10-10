import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const Error = ({ text }: { text: string }): JSX.Element => {
  return (
    <div className="relative m-auto flex w-fit flex-row items-center justify-center rounded-full">
      <FontAwesomeIcon icon={faExclamationTriangle} className="text-red mx-2 mb-2 mt-1.5" />
      {text && <p className="text-red relative top-0 mr-2 py-1 text-sm">{text}</p>}
    </div>
  );
};

export default Error;
