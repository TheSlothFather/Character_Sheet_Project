import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'arcane'
  | 'divine'
  | 'nature'
  | 'psionic';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'badge',
  primary: 'badge badge--primary',
  success: 'badge badge--success',
  danger: 'badge badge--danger',
  warning: 'badge badge--warning',
  info: 'badge badge--info',
  arcane: 'badge badge--arcane',
  divine: 'badge badge--divine',
  nature: 'badge badge--nature',
  psionic: 'badge badge--psionic',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className = '' }) => (
  <span className={`${variantClasses[variant]} ${className}`}>{children}</span>
);

// Tag component (larger, removable)
export interface TagProps {
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
}

export const Tag: React.FC<TagProps> = ({ children, onRemove, className = '' }) => (
  <span className={`tag ${onRemove ? 'tag--removable' : ''} ${className}`}>
    {children}
    {onRemove && (
      <button
        type="button"
        className="tag__remove"
        onClick={onRemove}
        aria-label="Remove"
      >
        ×
      </button>
    )}
  </span>
);

// Badge group for displaying multiple badges
export interface BadgeGroupProps {
  children: React.ReactNode;
  className?: string;
}

export const BadgeGroup: React.FC<BadgeGroupProps> = ({ children, className = '' }) => (
  <div className={`cluster cluster--xs ${className}`}>{children}</div>
);
