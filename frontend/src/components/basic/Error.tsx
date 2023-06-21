import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const Error = ({ text }: { text: string }): JSX.Element => {
  return (
    <div className="relative flex flex-row justify-center m-auto items-center w-fit rounded-full">
      <FontAwesomeIcon icon={faExclamationTriangle} className="text-red mt-1.5 mb-2 mx-2" />
      {text && <p className="relative top-0 text-red mr-2 text-sm py-1">{text}</p>}
    </div>
  );
};

export default Error;
