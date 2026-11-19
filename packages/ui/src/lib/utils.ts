import { clsx, type ClassValue } from "clsx";
import type { ComponentProps, JSXElementConstructor, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type StyledProps<T extends JSXElementConstructor<any>> = Omit<ComponentProps<T>, "className"> & {
  className?: string;
};

export type StyledContainerProps<T extends JSXElementConstructor<any>> = Omit<StyledProps<T>, "children"> & {
  children?: ReactNode;
};
