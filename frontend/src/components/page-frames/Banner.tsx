/* eslint-disable react/no-danger */
import DOMPurify from "dompurify";

import { useServerConfig } from "@app/context";

export const Banner = () => {
  const { config } = useServerConfig();

  // eslint-disable-next-line react/no-danger-with-children
  return config.pageFrameContent ? (
    <div className="h-[3vh] w-full text-center">
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(config.pageFrameContent) }} />
    </div>
  ) : (
    <div />
  );
};
