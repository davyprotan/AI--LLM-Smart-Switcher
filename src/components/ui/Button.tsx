import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

interface ButtonProps extends PropsWithChildren, ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ children, className, variant = "secondary", ...props }: ButtonProps) {
  return (
    <button {...props} className={`button button-${variant} ${className ?? ""}`.trim()}>
      {children}
    </button>
  );
}

