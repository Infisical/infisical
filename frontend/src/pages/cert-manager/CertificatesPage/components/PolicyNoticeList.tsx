import { FieldError } from "@app/components/v3";

import { PolicyNotice } from "./certificatePolicyGuidance";

type Props = {
  notices: PolicyNotice[];
};

/**
 * Policy violations that belong to a group of rows rather than to any one of them. Each entry gets
 * its own line, because a domain component sequence carries commas of its own and a comma-joined
 * list of them reads as one undifferentiated run.
 */
export const PolicyNoticeList = ({ notices }: Props) => {
  if (notices.length === 0) return null;

  return (
    <div className="mb-2 space-y-2">
      {notices.map((notice) => (
        <FieldError key={notice.key}>
          <span className="block">
            {notice.message}
            {notice.label ? ` ${notice.label}:` : null}
          </span>
          {notice.items?.map((item) => (
            <span key={item} className="block pl-3">
              {item}
            </span>
          ))}
        </FieldError>
      ))}
    </div>
  );
};
