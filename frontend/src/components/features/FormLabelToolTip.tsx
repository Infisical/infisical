import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormLabel, Tooltip } from "../v2";

// To give users example of possible values of TTL
export const FormLabelToolTip = ({ label, linkToMore, content }: { label: string, linkToMore: string, content: string }) => (
  <div>
    <FormLabel
      label={label}
      icon={
        <Tooltip
          content={
            <span>
              {content}{" "}
              <a
                href={linkToMore}
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
            className="relative bottom-1 right-1"
          />
        </Tooltip>
      }
    />
  </div>
);
