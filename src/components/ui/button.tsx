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

// `enabled:` keeps hover off disabled buttons; links (ButtonLink) are never disabled, so `hover:` is
// listed as well – on a <button> both apply only while enabled.
const variants: Record<ButtonVariant, string> = {
  primary:
    "border-accent-trace bg-accent-trace text-background " +
    "[&:not(:disabled)]:hover:border-trace-hover [&:not(:disabled)]:hover:bg-trace-hover",
  secondary:
    "border-line-strong bg-surface text-text " +
    "[&:not(:disabled)]:hover:border-accent-signal [&:not(:disabled)]:hover:bg-surface-raised",
  ghost: "border-transparent bg-transparent text-text [&:not(:disabled)]:hover:bg-surface-raised",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-label",
  md: "min-h-10 px-4 text-label",
  lg: "min-h-tap px-6 text-sm",
};

/** Class names of a button; ButtonLink uses them so a link can look like a button. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "primary", size = "md", type = "button", className, ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}
