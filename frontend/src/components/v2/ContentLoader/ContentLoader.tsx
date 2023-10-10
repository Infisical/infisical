// this will show a loading animation with text below
// if you pass array it will say it one by one giving user clear instruction on what's happening

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  text?: string | string[];
  frequency?: number;
};

export const ContentLoader = ({ text, frequency = 2000 }: Props) => {
  const [pos, setPos] = useState(0);
  const isTextArray = Array.isArray(text);
  useEffect(() => {
    let interval: NodeJS.Timer;
    if (isTextArray) {
      interval = setInterval(() => {
        setPos((state) => (state + 1) % text.length);
      }, frequency);
    }
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto flex relative flex-col h-screen w-full items-center justify-center px-8 text-mineshaft-50 dark:[color-scheme:dark] space-y-8">
      <img src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
      {text && isTextArray && (
        <AnimatePresence exitBeforeEnter>
          <motion.div
            className="text-primary"
            key={`content-loader-${pos}`}
            initial={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            exit={{ opacity: 0, translateY: -20 }}
          >
            {text[pos]}
          </motion.div>
        </AnimatePresence>
      )}
      {text && !isTextArray && <div className="text-primary text-xs">{text}</div>}
    </div>
  );
};
