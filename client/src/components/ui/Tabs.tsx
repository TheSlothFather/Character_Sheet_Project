import React from 'react';

export interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

const useTabsContext = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
};

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ value, onChange, children, className = '' }) => {
  const contextValue = React.useMemo(
    () => ({ activeTab: value, setActiveTab: onChange }),
    [value, onChange]
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={`tabs-container ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
};

export interface TabListProps {
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

export const TabList: React.FC<TabListProps> = ({
  children,
  className = '',
  'aria-label': ariaLabel,
}) => (
  <div className={`tabs ${className}`} role="tablist" aria-label={ariaLabel}>
    {children}
  </div>
);

export interface TabProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const Tab: React.FC<TabProps> = ({ value, children, disabled = false, className = '' }) => {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${value}`}
      id={`tab-${value}`}
      tabIndex={isActive ? 0 : -1}
      className={`tabs__tab ${isActive ? 'tabs__tab--active' : ''} ${className}`}
      onClick={() => setActiveTab(value)}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export interface TabPanelProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({ value, children, className = '' }) => {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      className={`tabs__panel ${className}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
};

// Simple pill-style tabs (alternative design)
export interface PillTabsProps {
  tabs: Array<{ value: string; label: React.ReactNode; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const PillTabs: React.FC<PillTabsProps> = ({ tabs, value, onChange, className = '' }) => (
  <div className={`pill-tabs ${className}`} role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.value}
        type="button"
        role="tab"
        aria-selected={value === tab.value}
        className={`btn pill-tabs__tab ${value === tab.value ? 'pill-tabs__tab--active' : ''}`}
        onClick={() => onChange(tab.value)}
        disabled={tab.disabled}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
