/* eslint-disable jsx-a11y/label-has-associated-control */
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { twMerge } from "tailwind-merge";

export type RadioGroupProps = RadioGroupPrimitive.RadioGroupProps;

// Note this component is not customizable (Heroku integration and potentially other pages depend on it)
export const RadioGroup = ({ className, children, ...props }: RadioGroupProps) => (
  <RadioGroupPrimitive.Root 
    className={twMerge("flex flex-row gap-5 px-6 mb-6", className)}
    defaultValue="App"
    aria-label="View density"
    {...props}
  >  
    <div className="flex items-center">
      <RadioGroupPrimitive.Item
        className="bg-bunker-400/20 w-[20px] h-[20px] rounded-full hover:bg-bunker-400/40 border border-bunker-400/60 duration-200 outline-none cursor-default"
        value="App"
        id="r1"
      >
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center w-full h-full relative after:content-[''] after:block after:w-[11px] after:h-[11px] after:rounded-[50%] after:bg-primary" />
      </RadioGroupPrimitive.Item>
      <label className="text-bunker-200 text-sm leading-none pl-2" htmlFor="r1">
        App
      </label>
    </div>
    <div className="flex items-center">
      <RadioGroupPrimitive.Item
        className="bg-bunker-400/20 w-[22px] h-[22px] rounded-full hover:bg-bunker-400/40 border border-bunker-400/60 duration-200 outline-none cursor-default"
        value="Pipeline"
        id="r2"
      >
        <RadioGroupPrimitive.Indicator className="flex items-center justify-center w-full h-full relative after:content-[''] after:block after:w-[13px] after:h-[13px] after:rounded-[50%] after:bg-primary" />
      </RadioGroupPrimitive.Item>
      <label className="text-bunker-200 text-sm leading-none pl-2" htmlFor="r2">
        Pipeline
      </label>
    </div>
  </RadioGroupPrimitive.Root>
);