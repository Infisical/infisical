import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";
import rehypeRaw from "rehype-raw";

import { useServerConfig } from "@app/context";

export const Banner = () => {
  const { config } = useServerConfig();

  return config.pageFrameContent ? (
    <div className="h-[3vh] w-full text-center">
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>
        {DOMPurify.sanitize(config.pageFrameContent)}
      </ReactMarkdown>
    </div>
  ) : (
    <div />
  );
};
