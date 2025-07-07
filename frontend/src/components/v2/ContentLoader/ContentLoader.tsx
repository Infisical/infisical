// this will show a loading animation with text below
// if you pass array it will say it one by one giving user clear instruction on what's happening

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { Lottie } from "../Lottie";

type Props = {
  text?: string | string[];
  frequency?: number;
  className?: string;
};

export const ContentLoader = ({ text, frequency = 2000, className }: Props) => {
  const [pos, setPos] = useState(0);
  const isTextArray = Array.isArray(text);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTextArray) {
      interval = setInterval(() => {
        setPos((state) => (state + 1) % text.length);
      }, frequency);
    }
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={twMerge(
        "container relative mx-auto flex h-screen w-full flex-col items-center justify-center space-y-8 px-8 text-mineshaft-50 dark:[color-scheme:dark]",
        className
      )}
    >
      <Lottie isAutoPlay icon="infisical_loading" className="h-32 w-32" />
      {text && isTextArray && (
        <AnimatePresence mode="wait">
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
      {text && !isTextArray && <div className="text-xs text-primary">{text}</div>}
    </div>
  );
};
