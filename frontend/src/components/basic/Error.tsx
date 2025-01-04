import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const Error = ({ text }: { text: string }): JSX.Element => {
  return (
    <div className="relative m-auto flex w-fit flex-row items-center justify-center rounded-full">
      <FontAwesomeIcon icon={faExclamationTriangle} className="mx-2 mb-2 mt-1.5 text-red" />
      {text && <p className="relative top-0 mr-2 py-1 text-sm text-red">{text}</p>}
    </div>
  );
};

export default Error;
