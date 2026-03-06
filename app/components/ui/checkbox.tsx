"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const CheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
    <polyline
      points="3 8.5 6.5 12 13 4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => {
    const isChecked = !!checked;
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isChecked}
        data-state={isChecked ? "checked" : "unchecked"}
        disabled={disabled}
        ref={ref}
        onClick={() => onCheckedChange?.(!isChecked)}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border border-input shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-black data-[state=checked]:text-white dark:data-[state=checked]:bg-white dark:data-[state=checked]:text-black",
          className
        )}
        {...props}
      >
        {isChecked && <CheckIcon className="h-3.5 w-3.5" />}
      </button>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
