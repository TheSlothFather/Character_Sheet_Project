import React from 'react';

// ============================================================================
// STACK - Vertical flex layout with gap
// ============================================================================

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

const stackGapClasses = {
  xs: 'stack--xs',
  sm: 'stack--sm',
  md: 'stack--md',
  lg: 'stack--lg',
  xl: 'stack--xl',
};

export const Stack: React.FC<StackProps> = ({ gap = 'md', children, className = '', ...props }) => (
  <div className={`stack ${stackGapClasses[gap]} ${className}`} {...props}>
    {children}
  </div>
);

// ============================================================================
// CLUSTER - Horizontal flex layout with wrap
// ============================================================================

export interface ClusterProps extends React.HTMLAttributes<HTMLDivElement> {
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  children: React.ReactNode;
}

const clusterGapClasses = {
  xs: 'cluster--xs',
  sm: 'cluster--sm',
  md: 'cluster--md',
  lg: 'cluster--lg',
};

export const Cluster: React.FC<ClusterProps> = ({
  gap = 'sm',
  align = 'center',
  justify = 'start',
  children,
  className = '',
  style,
  ...props
}) => (
  <div
    className={`cluster ${clusterGapClasses[gap]} ${className}`}
    style={{
      alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
      justifyContent:
        justify === 'start'
          ? 'flex-start'
          : justify === 'end'
          ? 'flex-end'
          : justify === 'between'
          ? 'space-between'
          : justify === 'around'
          ? 'space-around'
          : justify,
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

// ============================================================================
// GRID - CSS Grid layout
// ============================================================================

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 2 | 3 | 4 | 'auto-sm' | 'auto-md' | 'auto-lg';
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const gridColumnClasses = {
  2: 'grid--2',
  3: 'grid--3',
  4: 'grid--4',
  'auto-sm': 'grid--auto-sm',
  'auto-md': 'grid--auto-md',
  'auto-lg': 'grid--auto-lg',
};

export const Grid: React.FC<GridProps> = ({
  columns = 'auto-md',
  gap = 'md',
  children,
  className = '',
  style,
  ...props
}) => (
  <div
    className={`grid ${gridColumnClasses[columns]} ${className}`}
    style={{
      gap: `var(--space-${gap === 'xs' ? '2' : gap === 'sm' ? '3' : gap === 'md' ? '4' : '6'})`,
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

// ============================================================================
// SIDEBAR LAYOUT
// ============================================================================

export interface SidebarLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  sidebarWidth?: string;
  className?: string;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({
  sidebar,
  main,
  sidebarWidth = '280px',
  className = '',
}) => (
  <div className={`with-sidebar ${className}`}>
    <aside className="with-sidebar__sidebar" style={{ flex: `0 0 ${sidebarWidth}` }}>
      {sidebar}
    </aside>
    <main className="with-sidebar__main">{main}</main>
  </div>
);

// ============================================================================
// DIVIDER
// ============================================================================

export interface DividerProps {
  ornate?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const Divider: React.FC<DividerProps> = ({ ornate = false, children, className = '' }) => (
  <div className={`divider ${ornate ? 'divider--ornate' : ''} ${className}`}>
    {children}
  </div>
);

// ============================================================================
// CONTAINER
// ============================================================================

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'narrow' | 'default' | 'wide';
  children: React.ReactNode;
}

const containerSizeClasses = {
  narrow: 'container--narrow',
  default: '',
  wide: 'container--wide',
};

export const Container: React.FC<ContainerProps> = ({
  size = 'default',
  children,
  className = '',
  ...props
}) => (
  <div className={`container ${containerSizeClasses[size]} ${className}`} {...props}>
    {children}
  </div>
);
