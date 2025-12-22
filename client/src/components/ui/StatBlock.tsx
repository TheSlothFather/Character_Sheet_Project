import React from 'react';

export type StatBlockVariant = 'default' | 'primary' | 'success' | 'danger' | 'warning';

export interface StatBlockProps {
  label: string;
  value: React.ReactNode;
  modifier?: React.ReactNode;
  variant?: StatBlockVariant;
  action?: React.ReactNode;
  className?: string;
}

const variantClasses: Record<StatBlockVariant, string> = {
  default: 'stat-block',
  primary: 'stat-block stat-block--primary',
  success: 'stat-block stat-block--success',
  danger: 'stat-block stat-block--danger',
  warning: 'stat-block stat-block--warning',
};

export const StatBlock: React.FC<StatBlockProps> = ({
  label,
  value,
  modifier,
  variant = 'default',
  action,
  className = '',
}) => (
  <div className={`${variantClasses[variant]} ${className}`}>
    <span className="stat-block__label">{label}</span>
    <span className="stat-block__value">{value}</span>
    {modifier && <span className="stat-block__modifier">{modifier}</span>}
    {action && <div className="stat-block__action">{action}</div>}
  </div>
);

export interface StatRowProps {
  children: React.ReactNode;
  className?: string;
  justify?: 'start' | 'center' | 'between' | 'around' | 'evenly';
}

const justifyClasses = {
  start: 'justify-start',
  center: 'justify-center',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

export const StatRow: React.FC<StatRowProps> = ({
  children,
  className = '',
  justify = 'start',
}) => (
  <div className={`stat-row ${justifyClasses[justify]} ${className}`}>{children}</div>
);

// Compact stat display for inline use
export interface StatInlineProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

export const StatInline: React.FC<StatInlineProps> = ({ label, value, hint, className = '' }) => (
  <div className={`stat-inline ${className}`}>
    <div className="stat-inline__header">
      <span className="stat-inline__label">{label}</span>
      <strong className="stat-inline__value">{value}</strong>
    </div>
    {hint && <span className="stat-inline__hint">{hint}</span>}
  </div>
);

// Attribute pill component (for character summary)
export interface AttributePillProps {
  label: string;
  value: React.ReactNode;
  action?: React.ReactNode;
  hint?: React.ReactNode;
  variant?: 'default' | 'stacked';
  className?: string;
}

export const AttributePill: React.FC<AttributePillProps> = ({
  label,
  value,
  action,
  hint,
  variant = 'default',
  className = '',
}) => {
  if (variant === 'stacked') {
    return (
      <div className={`attribute-pill attribute-pill--stacked ${className}`}>
        <div className="attribute-pill__header">
          <span className="attribute-pill__label">{label}</span>
          <strong className="attribute-pill__value">{value}</strong>
        </div>
        {hint && <span className="attribute-pill__hint">{hint}</span>}
      </div>
    );
  }

  return (
    <div className={`attribute-pill ${className}`}>
      <span className="attribute-pill__label">{label}</span>
      <div className="attribute-pill__actions">
        <strong className="attribute-pill__value">{value}</strong>
        {action}
      </div>
    </div>
  );
};
