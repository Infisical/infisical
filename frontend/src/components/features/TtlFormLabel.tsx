import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormLabel, Tooltip } from "../v2";

// To give users example of possible values of TTL
export const TtlFormLabel = ({ label }: { label: string }) => (
  <div>
    <FormLabel
      label={label}
      icon={
        <Tooltip
          content={
            <span>
              <a
                href="https://github.com/vercel/ms?tab=readme-ov-file#examples"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-700"
              >
                More
              </a>
            </span>
          }
        >
          <FontAwesomeIcon
            icon={faQuestionCircle}
            size="sm"
            className="relative bottom-px right-1"
          />
        </Tooltip>
      }
    />
  </div>
);
