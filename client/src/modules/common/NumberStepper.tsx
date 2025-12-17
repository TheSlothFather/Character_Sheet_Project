import React from "react";

interface NumberStepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: number) => void;
  ariaLabel?: string;
  inputStyle?: React.CSSProperties;
}

const clampValue = (value: number, min?: number, max?: number): number => {
  let next = value;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
};

export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  inputStyle
}) => {
  const adjust = (delta: number) => {
    const candidate = clampValue(value + delta, min, max);
    onChange(candidate);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const numericPortion = event.target.value.replace(/[^0-9-]/g, "");
    const parsed = Number(numericPortion);
    if (!Number.isFinite(parsed)) {
      if (numericPortion === "" && typeof min === "undefined") {
        onChange(0);
      }
      return;
    }

    onChange(clampValue(parsed, min, max));
  };

  const buttonStyle: React.CSSProperties = {
    border: "1px solid #2b3747",
    background: "#0c121a",
    color: "#e6edf7",
    fontWeight: 700,
    fontSize: 16,
    padding: "0.35rem 0.65rem",
    borderRadius: 6,
    cursor: "pointer",
    lineHeight: 1,
    minWidth: 36
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "stretch", gap: 8 }}>
      <button type="button" style={buttonStyle} onClick={() => adjust(-step)} aria-label="Decrease">
        −
      </button>
      <input
        aria-label={ariaLabel}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={handleInputChange}
        onWheel={(e) => e.preventDefault()}
        style={{
          background: "#0c121a",
          border: "1px solid #2b3747",
          borderRadius: 8,
          padding: "0.45rem 0.55rem",
          color: "#e6edf7",
          fontSize: 15,
          fontWeight: 600,
          width: "100%",
          boxSizing: "border-box",
          ...inputStyle
        }}
      />
      <button type="button" style={buttonStyle} onClick={() => adjust(step)} aria-label="Increase">
        +
      </button>
    </div>
  );
};

