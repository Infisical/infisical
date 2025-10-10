import {
  forwardRef,
  InputHTMLAttributes,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

type Props = {
  min: number;
  max: number;
  step?: number;
  isDisabled?: boolean;
  isRequired?: boolean;
  showValue?: boolean;
  valuePosition?: "top" | "right";
  containerClassName?: string;
  trackClassName?: string;
  fillClassName?: string;
  thumbClassName?: string;
  onChange?: (value: number) => void;
  onChangeComplete?: (value: number) => void;
};

const sliderTrackVariants = cva("h-1 w-full bg-mineshaft-600 rounded-full relative", {
  variants: {
    variant: {
      default: "",
      thin: "h-0.5",
      thick: "h-1.5"
    },
    isDisabled: {
      true: "opacity-50 cursor-not-allowed",
      false: ""
    }
  }
});

const sliderFillVariants = cva("absolute h-full rounded-full", {
  variants: {
    variant: {
      default: "bg-primary-500",
      secondary: "bg-secondary-500",
      danger: "bg-red-500"
    },
    isDisabled: {
      true: "opacity-50",
      false: ""
    }
  }
});

const sliderThumbVariants = cva(
  "absolute w-4 h-4 rounded-full shadow-sm transform -translate-x-1/2 -mt-1.5 focus:outline-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary-500 focus:ring-2 focus:ring-primary-400/50",
        secondary: "bg-secondary-500 focus:ring-2 focus:ring-secondary-400/50",
        danger: "bg-red-500 focus:ring-2 focus:ring-red-400/50"
      },
      isDisabled: {
        true: "opacity-50 cursor-not-allowed",
        false: "cursor-pointer"
      },
      size: {
        sm: "w-3 h-3 -mt-1",
        md: "w-4 h-4 -mt-1.5",
        lg: "w-5 h-5 -mt-2"
      }
    }
  }
);

const sliderContainerVariants = cva("relative inline-flex font-inter", {
  variants: {
    isFullWidth: {
      true: "w-full",
      false: ""
    }
  }
});

export type SliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> &
  VariantProps<typeof sliderTrackVariants> &
  VariantProps<typeof sliderThumbVariants> &
  VariantProps<typeof sliderContainerVariants> &
  Props;

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      containerClassName,
      trackClassName,
      fillClassName,
      thumbClassName,
      min = 0,
      max = 100,
      step = 1,
      value,
      defaultValue,
      isDisabled = false,
      isFullWidth = true,
      isRequired = false,
      showValue = false,
      valuePosition = "top",
      variant = "default",
      size = "md",
      onChange,
      onChangeComplete,
      ...props
    },
    ref
  ): JSX.Element => {
    let initialValue = min;
    if (value !== undefined) {
      initialValue = Number(value);
    } else if (defaultValue !== undefined) {
      initialValue = Number(defaultValue);
    }

    const [currentValue, setCurrentValue] = useState<number>(initialValue);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const percentage = Math.max(0, Math.min(100, ((currentValue - min) / (max - min)) * 100));

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

    useEffect(() => {
      if (value !== undefined && Number(value) !== currentValue) {
        setCurrentValue(Number(value));
      }
    }, [value, currentValue]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = Number(e.target.value);
        setCurrentValue(newValue);
        onChange?.(newValue);
      },
      [onChange]
    );

    const handleMouseDown = useCallback(() => {
      if (!isDisabled) {
        setIsDragging(true);
      }
    }, [isDisabled]);

    const handleChangeComplete = useCallback(() => {
      if (isDragging) {
        onChangeComplete?.(currentValue);
        setIsDragging(false);
      }
    }, [isDragging, currentValue, onChangeComplete]);

    useEffect(() => {
      if (isDragging) {
        const handleGlobalMouseUp = () => handleChangeComplete();

        document.addEventListener("mouseup", handleGlobalMouseUp);
        document.addEventListener("touchend", handleGlobalMouseUp);

        return () => {
          document.removeEventListener("mouseup", handleGlobalMouseUp);
          document.removeEventListener("touchend", handleGlobalMouseUp);
        };
      }
      return () => {};
    }, [isDragging, handleChangeComplete]);

    const ValueDisplay = showValue ? (
      <div className="text-xs text-bunker-300">{currentValue}</div>
    ) : null;

    return (
      <div
        className={twMerge(
          sliderContainerVariants({ isFullWidth, className: containerClassName }),
          "my-2"
        )}
      >
        {showValue && valuePosition === "top" && ValueDisplay}

        <div className="relative flex w-full items-center">
          <div
            className={twMerge(
              sliderTrackVariants({ variant, isDisabled, className: trackClassName })
            )}
          >
            <div
              className={twMerge(
                sliderFillVariants({ variant, isDisabled, className: fillClassName }),
                "left-0"
              )}
              style={{ width: `${percentage}%` }}
            />

            <div
              className={twMerge(
                sliderThumbVariants({ variant, isDisabled, size, className: thumbClassName })
              )}
              style={{ left: `${percentage}%` }}
            />
          </div>

          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={currentValue}
            onChange={handleChange}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            disabled={isDisabled}
            required={isRequired}
            ref={inputRef}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            {...props}
          />

          {showValue && valuePosition === "right" && (
            <div className="ml-2 text-xs text-bunker-300">{currentValue}</div>
          )}
        </div>
      </div>
    );
  }
);

Slider.displayName = "Slider";
