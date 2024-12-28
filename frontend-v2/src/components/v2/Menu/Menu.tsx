import {
  ComponentPropsWithRef,
  ElementType,
  ReactNode,
  Ref,
  useEffect,
  useRef,
  useState
} from "react";
import { motion } from "framer-motion";
import Lottie, { LottieRefCurrentProps } from "lottie-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";

export type MenuProps = {
  children: ReactNode;
  className?: string;
};

export const Menu = ({ children, className }: MenuProps): JSX.Element => {
  return <ul className={twMerge("p-2", className)}>{children}</ul>;
};

export type MenuItemProps<T extends ElementType> = {
  // Kudos to https://itnext.io/react-polymorphic-components-with-typescript-f7ce72ea7af2
  as?: T;
  children: ReactNode;
  icon?: string;
  description?: ReactNode;
  isDisabled?: boolean;
  isSelected?: boolean;
  className?: string;
  inputRef?: Ref<T>;
};

export const MenuItem = <T extends ElementType = "button">({
  children,
  icon,
  className,
  isDisabled,
  isSelected,
  as: Item = "button",
  description,
  // wrapping in forward ref with generic component causes the loss of ts definitions on props
  inputRef,
  ...props
}: MenuItemProps<T> & ComponentPropsWithRef<T>): JSX.Element => {
  const iconRef = useRef<LottieRefCurrentProps | null>(null);
  // to trigger ref change
  const [shouldRenderLottie, setShouldRenderLottie] = useState(false);
  const animationData = useRef();
  useEffect(() => {
    if (icon) {
      import(`../../../assets/lotties/${icon}.json`)
        .then((el) => {
          animationData.current = { ...el };
          setShouldRenderLottie(true);
        })
        .catch(() => {
          createNotification({ type: "error", title: "Failed to load icon", text: "Missing icon" });
        });
    }
  }, [icon]);

  return (
    <div onMouseEnter={() => iconRef.current?.play()} onMouseLeave={() => iconRef.current?.stop()}>
      <li
        className={twMerge(
          "duration-50 group mt-0.5 flex cursor-pointer flex-col rounded px-1 py-2 font-inter text-sm text-bunker-100 transition-all hover:bg-mineshaft-700",
          isSelected && "bg-mineshaft-600 hover:bg-mineshaft-600",
          isDisabled && "cursor-not-allowed hover:bg-transparent",
          className
        )}
      >
        <motion.span className="flex w-full flex-row items-center justify-start rounded-sm">
          <Item
            type="button"
            role="menuitem"
            className="relative flex items-center"
            ref={inputRef}
            {...props}
          >
            <div
              className={`${
                isSelected ? "visisble" : "invisible"
              } absolute -left-[0.28rem] h-5 w-[0.07rem] rounded-md bg-primary`}
            />
            {/* {icon && <span className="mr-3 ml-4 w-5 block group-hover:hidden">{icon}</span>} */}
            {icon && shouldRenderLottie && animationData.current && (
              <Lottie
                lottieRef={iconRef}
                style={{ width: 22, height: 22 }}
                animationData={animationData.current}
                loop={false}
                autoplay={false}
                className="my-auto ml-[0.1rem] mr-3"
              />
            )}
            <span className="flex-grow text-left">{children}</span>
          </Item>
          {description && <span className="mt-2 text-xs">{description}</span>}
        </motion.span>
      </li>
    </div>
  );
};

MenuItem.displayName = "MenuItem";

export type MenuGroupProps = {
  children: ReactNode;
  title: ReactNode;
};

export const MenuGroup = ({ children, title }: MenuGroupProps): JSX.Element => (
  <>
    <li className="p-2 text-xs text-gray-400">{title}</li>
    {children}
  </>
);
