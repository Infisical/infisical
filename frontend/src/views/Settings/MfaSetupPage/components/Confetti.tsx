import React, { FC } from "react";
import styled, { keyframes } from "styled-components";

import guuid from "@app/components/utilities/randomId"

const generateRandomNumber = (min: number, max: number) => {
  return Math.random() * (max - min) + min;
};

const generateRandomColor = () => {
  const colors = ["#ffcc00", "#ff9900", "#ff6600", "#ff3300", "#cc0000", "#ff3366", "#ff33cc"];
  const randomIndex = Math.floor(Math.random() * colors.length);
  return colors[randomIndex];
};

const fallAnimation = keyframes`
  0% {
    transform: translateY(0) rotate(0);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(360deg);
    opacity: 0;
  }
`;

const ConfettiElement = styled.div<{ animationDuration?: string; left?: string; animationDelay?: string }>`
  width: 6px;
  height: 6px;
  position: absolute;
  opacity: 0;
  transform-origin: center;
  background-color: ${generateRandomColor()};
  animation: ${fallAnimation} ${(props) => props.animationDuration || "5s"} linear infinite;
  left: ${(props) => props.left || "0%"};
  animation-delay: ${(props) => props.animationDelay || "0s"};
  animation-fill-mode: both;
`;

export const Confetti: FC = () => {
  const confettiCount: number = 150;
  return (
    <div className="relative w-full h-0 overflow-visible">
      {[...Array(confettiCount)].map(() => (
        <ConfettiElement
          animationDuration={`${generateRandomNumber(5, 30)}s`}
          left={`${generateRandomNumber(0, 100)}%`}
          animationDelay={`${generateRandomNumber(0, 5)}s`}
          key={guuid()}
          style={{ backgroundColor: generateRandomColor() }}
        />
      ))}
    </div>
  );
};
