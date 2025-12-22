import React from 'react';

// ============================================================================
// INPUT
// ============================================================================

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    const classes = ['input', error && 'input--error', className].filter(Boolean).join(' ');
    return <input ref={ref} className={classes} {...props} />;
  }
);

Input.displayName = 'Input';

// ============================================================================
// SELECT
// ============================================================================

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className = '', children, ...props }, ref) => {
    const classes = ['select', error && 'select--error', className].filter(Boolean).join(' ');
    return (
      <select ref={ref} className={classes} {...props}>
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';

// ============================================================================
// TEXTAREA
// ============================================================================

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className = '', ...props }, ref) => {
    const classes = ['textarea', error && 'textarea--error', className].filter(Boolean).join(' ');
    return <textarea ref={ref} className={classes} {...props} />;
  }
);

Textarea.displayName = 'Textarea';

// ============================================================================
// CHECKBOX
// ============================================================================

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const inputId = id || `checkbox-${React.useId()}`;

    return (
      <label className={`checkbox ${className}`} htmlFor={inputId}>
        <input ref={ref} type="checkbox" className="checkbox__input" id={inputId} {...props} />
        {label && <span className="checkbox__label">{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

// ============================================================================
// RADIO
// ============================================================================

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ label, className = '', id, ...props }, ref) => {
    const inputId = id || `radio-${React.useId()}`;

    return (
      <label className={`radio ${className}`} htmlFor={inputId}>
        <input ref={ref} type="radio" className="radio__input" id={inputId} {...props} />
        {label && <span className="radio__label">{label}</span>}
      </label>
    );
  }
);

Radio.displayName = 'Radio';

// ============================================================================
// FIELD (Form field wrapper with label/hint/error)
// ============================================================================

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  error,
  required,
  children,
  className = '',
}) => (
  <div className={`field ${className}`}>
    {label && (
      <label className="field__label">
        {label}
        {required && <span className="field__required" aria-hidden="true"> *</span>}
      </label>
    )}
    {children}
    {hint && !error && <span className="field__hint">{hint}</span>}
    {error && <span className="field__error" role="alert">{error}</span>}
  </div>
);

// ============================================================================
// SPIN BUTTON (Numeric input with increment/decrement)
// ============================================================================

export interface SpinButtonProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export const SpinButton: React.FC<SpinButtonProps> = ({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  disabled = false,
  className = '',
  label,
}) => {
  const [inputValue, setInputValue] = React.useState(String(value));
  const valueRef = React.useRef(value);
  const repeatTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const repeatIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    valueRef.current = value;
    setInputValue(String(value));
  }, [value]);

  const stopRepeating = React.useCallback(() => {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current);
      repeatTimeoutRef.current = null;
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }, []);

  React.useEffect(() => stopRepeating, [stopRepeating]);

  const handleChange = (newValue: number) => {
    if (!Number.isFinite(newValue)) return;
    const clamped = Math.min(Math.max(Math.floor(newValue), min), max);
    onChange(clamped);
  };

  const applyDelta = (delta: number) => {
    handleChange(valueRef.current + delta);
  };

  const startRepeating = (delta: number) => {
    if (disabled) return;
    stopRepeating();
    applyDelta(delta);
    repeatTimeoutRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => applyDelta(delta), 125);
    }, 350);
  };

  const canDecrement = value > min;
  const canIncrement = value < max;

  return (
    <div className={`spin-button ${className}`} role="group" aria-label={label}>
      <button
        type="button"
        className="btn btn--icon btn--sm spin-button__decrement"
        onPointerDown={() => startRepeating(-step)}
        onPointerUp={stopRepeating}
        onPointerLeave={stopRepeating}
        onPointerCancel={stopRepeating}
        disabled={disabled || !canDecrement}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        className="input spin-button__input"
        value={inputValue}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          setInputValue(next);
          if (next.trim() === '' || next === '-') return;
          const parsed = parseInt(next, 10);
          if (Number.isFinite(parsed)) handleChange(parsed);
        }}
        onBlur={() => setInputValue(String(value))}
        onWheel={(e) => {
          e.preventDefault();
          e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className="btn btn--icon btn--sm spin-button__increment"
        onPointerDown={() => startRepeating(step)}
        onPointerUp={stopRepeating}
        onPointerLeave={stopRepeating}
        onPointerCancel={stopRepeating}
        disabled={disabled || !canIncrement}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
};
