"use client";

import { Search, X } from "lucide-react";
import { useRef, type ComponentProps } from "react";

type Props = Omit<ComponentProps<"input">, "size" | "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** sm = inside compact toolbars, md = filter rows (matches selects/chips), lg = primary search */
  size?: "sm" | "md" | "lg";
  wrapperClassName?: string;
};

/**
 * The one search box used across the site: magnifier on the left, a clear button once
 * something is typed, Esc clears the text (a second Esc goes to the page, e.g. closes a menu).
 */
export function SearchField({ value, onValueChange, size = "md", wrapperClassName = "", className = "", onKeyDown, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={`search-field ${wrapperClassName}`} data-size={size}>
      <Search aria-hidden className="search-icon" />
      <input
        ref={ref}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onValueChange("");
            return;
          }
          onKeyDown?.(e);
        }}
        className={`input ${className}`}
        {...rest}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear search"
          onClick={() => {
            onValueChange("");
            ref.current?.focus();
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
