import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'flush' | 'interactive';
  selected?: boolean;
  children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', selected = false, className = '', children, ...props }, ref) => {
    const classes = [
      'card',
      variant === 'elevated' && 'card--elevated',
      variant === 'flush' && 'card--flush',
      variant === 'interactive' && 'card--interactive',
      selected && 'card--selected',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  action,
  children,
  className = '',
  ...props
}) => (
  <div className={`card__header ${className}`} {...props}>
    {children ?? (
      <>
        {title && <h3 className="card__title">{title}</h3>}
        {action}
      </>
    )}
  </div>
);

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardBody: React.FC<CardBodyProps> = ({ children, className = '', ...props }) => (
  <div className={`card__body ${className}`} {...props}>
    {children}
  </div>
);

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardFooter: React.FC<CardFooterProps> = ({ children, className = '', ...props }) => (
  <div className={`card__footer ${className}`} {...props}>
    {children}
  </div>
);

// Panel variant - lighter background
export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({ children, className = '', ...props }) => (
  <div className={`panel ${className}`} {...props}>
    {children}
  </div>
);
