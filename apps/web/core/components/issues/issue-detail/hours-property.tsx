import React, { useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

type THoursPropertyProps = {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
};

export const HoursProperty: React.FC<THoursPropertyProps> = ({
  label,
  value,
  onChange,
  disabled = false,
  className,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (disabled) return;
    setInputValue(value != null ? String(value) : "");
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    const parsed = parseFloat(inputValue);
    if (inputValue === "" || inputValue === "-") {
      onChange(null);
    } else if (!isNaN(parsed) && parsed >= 0) {
      onChange(Math.round(parsed * 10) / 10); // round to 1 decimal
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") inputRef.current?.blur();
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  const displayText = value != null ? `${value} h` : "- h";

  return (
    <div className={cn("flex items-center gap-1.5 text-sm", className)}>
      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-custom-text-300" />
      <span className="text-xs text-custom-text-300 whitespace-nowrap">{label}</span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.5"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-16 rounded border border-custom-border-200 bg-custom-background-100 px-1.5 py-0.5 text-xs text-custom-text-100 focus:outline-none focus:ring-1 focus:ring-custom-primary-100"
        />
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            value != null
              ? "text-custom-text-100 hover:bg-custom-background-80"
              : "text-custom-text-400 hover:bg-custom-background-80",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          {displayText}
        </button>
      )}
    </div>
  );
};

// Compact inline variant for list/kanban views (no label, icon only on hover)
export const HoursPropertyInline: React.FC<
  Omit<THoursPropertyProps, "label"> & { icon?: React.ReactNode; tooltip?: string }
> = ({ value, onChange, disabled = false, className, icon, tooltip }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (disabled) return;
    setInputValue(value != null ? String(value) : "");
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    const parsed = parseFloat(inputValue);
    if (inputValue === "") {
      onChange(null);
    } else if (!isNaN(parsed) && parsed >= 0) {
      onChange(Math.round(parsed * 10) / 10);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") inputRef.current?.blur();
    if (e.key === "Escape") setIsEditing(false);
  };

  const displayText = value != null ? `${value}h` : "-";

  const content = (
    <div className={cn("flex items-center gap-1 text-xs", className)}>
      {icon && <span className="text-custom-text-300">{icon}</span>}
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.5"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-14 rounded border border-custom-border-200 bg-custom-background-100 px-1 py-0.5 text-xs text-custom-text-100 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={cn(
            "rounded px-1 py-0.5 text-xs",
            value != null ? "text-custom-text-200" : "text-custom-text-400",
            !disabled && "hover:bg-custom-background-80",
            disabled && "cursor-not-allowed"
          )}
        >
          {displayText}
        </button>
      )}
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip tooltipContent={tooltip} position="top">
        {content}
      </Tooltip>
    );
  }

  return content;
};
