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
  lottieClassName?: string;
};

export const ContentLoader = ({ text, frequency = 2000, className, lottieClassName }: Props) => {
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
        "text-mineshaft-50 dark:scheme-dark container relative mx-auto flex h-screen w-full flex-col items-center justify-center space-y-8 px-8",
        className
      )}
    >
      <Lottie
        isAutoPlay
        icon="infisical_loading"
        className={twMerge("h-32 w-32", lottieClassName)}
      />
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
      {text && !isTextArray && <div className="text-primary text-xs">{text}</div>}
    </div>
  );
};
