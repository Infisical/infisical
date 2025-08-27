import { faArrowUpRightFromSquare, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormLabel, Tooltip } from "../v2";

// To give users example of possible values of TTL
export const TtlFormLabel = ({ label }: { label: string }) => (
  <div>
    <FormLabel
      label={label}
      icon={
        <Tooltip
          className="max-w-lg"
          content={
            <span>
              Examples: 30m, 1h, 3d, etc.{" "}
              <a
                href="https://github.com/vercel/ms?tab=readme-ov-file#examples"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:text-mineshaft-100"
              >
                See More Examples{" "}
                <FontAwesomeIcon size="xs" className="mt-0.5" icon={faArrowUpRightFromSquare} />
              </a>
            </span>
          }
        >
          <FontAwesomeIcon
            icon={faQuestionCircle}
            size="sm"
            className="relative right-1 mt-0.5 text-mineshaft-300"
          />
        </Tooltip>
      }
    />
  </div>
);
