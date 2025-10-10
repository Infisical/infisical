/* eslint-disable jsx-a11y/label-has-associated-control */
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { twMerge } from "tailwind-merge";

export type RadioGroupProps = RadioGroupPrimitive.RadioGroupProps;

// Note this component is not customizable (Heroku integration and potentially other pages depend on it)
export const RadioGroup = ({ className, children, ...props }: RadioGroupProps) => (
  <RadioGroupPrimitive.Root
    className={twMerge("mb-6 flex flex-row gap-5 px-6", className)}
    defaultValue="App"
    aria-label="View density"
    {...props}
  >
    <div className="flex items-center">
      <RadioGroupPrimitive.Item
        className="border-bunker-400/60 bg-bunker-400/20 outline-hidden hover:bg-bunker-400/40 h-[20px] w-[20px] cursor-default rounded-full border duration-200"
        value="App"
        id="r1"
      >
        <RadioGroupPrimitive.Indicator className="after:bg-primary relative flex h-full w-full items-center justify-center after:block after:h-[11px] after:w-[11px] after:rounded-[50%] after:content-['']" />
      </RadioGroupPrimitive.Item>
      <label className="text-bunker-200 pl-2 text-sm leading-none" htmlFor="r1">
        App
      </label>
    </div>
    <div className="flex items-center">
      <RadioGroupPrimitive.Item
        className="border-bunker-400/60 bg-bunker-400/20 outline-hidden hover:bg-bunker-400/40 h-[22px] w-[22px] cursor-default rounded-full border duration-200"
        value="Pipeline"
        id="r2"
      >
        <RadioGroupPrimitive.Indicator className="after:bg-primary relative flex h-full w-full items-center justify-center after:block after:h-[13px] after:w-[13px] after:rounded-[50%] after:content-['']" />
      </RadioGroupPrimitive.Item>
      <label className="text-bunker-200 pl-2 text-sm leading-none" htmlFor="r2">
        Pipeline
      </label>
    </div>
  </RadioGroupPrimitive.Root>
);
