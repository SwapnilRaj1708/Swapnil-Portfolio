import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-xs border font-mono uppercase tracking-wider " +
  "transition-colors duration-fast ease-signal select-none " +
  "disabled:cursor-not-allowed disabled:border-dashed disabled:border-line-strong disabled:bg-surface disabled:text-text-muted";

const variants: Record<ButtonVariant, string> = {
  primary: "border-accent-trace bg-accent-trace text-background enabled:hover:border-trace-hover enabled:hover:bg-trace-hover",
  secondary:
    "border-line-strong bg-surface text-text enabled:hover:border-accent-signal enabled:hover:bg-surface-raised",
  ghost: "border-transparent bg-transparent text-text enabled:hover:bg-surface-raised",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-label",
  md: "min-h-10 px-4 text-label",
  lg: "min-h-tap px-6 text-sm",
};

export function Button({ variant = "primary", size = "md", type = "button", className, ...rest }: ButtonProps) {
  return <button type={type} className={clsx(base, variants[variant], sizes[size], className)} {...rest} />;
}
