import { clsx } from "clsx";
import type { ReactNode } from "react";

export type ContainerProps = {
  as?: "div" | "section" | "header" | "footer";
  /** Lay children on the content grid: 4 columns on phones, 8 on tablets, 12 from `lg`. */
  grid?: boolean;
  className?: string;
  children: ReactNode;
  id?: string;
};

/** Centred content column with the fluid page gutter. */
export function Container({ as: Component = "div", grid = false, className, children, id }: ContainerProps) {
  return (
    <Component
      id={id}
      className={clsx(
        "mx-auto w-full max-w-content px-gutter",
        grid && "grid grid-cols-4 gap-x-4 md:grid-cols-8 lg:grid-cols-12 lg:gap-x-6",
        className,
      )}
    >
      {children}
    </Component>
  );
}
