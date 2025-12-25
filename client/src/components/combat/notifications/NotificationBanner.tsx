/**
 * NotificationBanner - War Chronicle Edition
 *
 * Battle dispatch system for urgent combat communications.
 * Each notification unfurls from above like a military order scroll.
 */

import React, { useEffect, useState } from 'react';
import './NotificationBanner.css';

export interface Notification {
  id: string;
  type: 'gm-request' | 'attack-incoming' | 'turn-warning' | 'combat-event' | 'system';
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number | null; // ms, null = persistent until dismissed
}

export interface NotificationBannerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

// Notification metadata by type
const NOTIFICATION_CONFIG = {
  'gm-request': {
    icon: '👁️',
    seal: '🔴',
    priority: 1,
    defaultDuration: null, // Persistent
    ariaLabel: 'Urgent request from Game Master',
  },
  'attack-incoming': {
    icon: '⚔️',
    seal: '🟠',
    priority: 1,
    defaultDuration: null,
    ariaLabel: 'Incoming attack warning',
  },
  'turn-warning': {
    icon: '⏰',
    seal: '🟡',
    priority: 2,
    defaultDuration: 10000,
    ariaLabel: 'Turn time warning',
  },
  'combat-event': {
    icon: '📜',
    seal: '🟢',
    priority: 3,
    defaultDuration: 5000,
    ariaLabel: 'Combat event notification',
  },
  'system': {
    icon: '⚙️',
    seal: '⚪',
    priority: 3,
    defaultDuration: 5000,
    ariaLabel: 'System notification',
  },
} as const;

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  notifications,
  onDismiss,
}) => {
  // Priority queue: max 2 visible, highest priority first
  const visibleNotifications = React.useMemo(() => {
    return [...notifications]
      .sort((a, b) => {
        const aPriority = NOTIFICATION_CONFIG[a.type].priority;
        const bPriority = NOTIFICATION_CONFIG[b.type].priority;
        return aPriority - bPriority;
      })
      .slice(0, 2);
  }, [notifications]);

  return (
    <div
      className="notification-banner-container"
      role="region"
      aria-live="polite"
      aria-label="Combat notifications"
    >
      {visibleNotifications.map((notification, index) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
          stackIndex={index}
        />
      ))}
    </div>
  );
};

// Individual notification scroll
const NotificationItem: React.FC<{
  notification: Notification;
  onDismiss: (id: string) => void;
  stackIndex: number;
}> = ({ notification, onDismiss, stackIndex }) => {
  const [isExiting, setIsExiting] = useState(false);
  const config = NOTIFICATION_CONFIG[notification.type];
  const duration = notification.duration ?? config.defaultDuration;

  // Auto-dismiss timer
  useEffect(() => {
    if (duration === null) return; // Persistent notification

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, notification.id]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 200); // Match exit animation
  };

  const handleAction = () => {
    if (notification.action) {
      notification.action.onClick();
      handleDismiss();
    }
  };

  const isPersistent = duration === null;
  const isUrgent = config.priority === 1;

  return (
    <div
      className={`
        notification-scroll
        notification-scroll--${notification.type}
        ${isExiting ? 'notification-scroll--exiting' : ''}
        ${isPersistent ? 'notification-scroll--persistent' : ''}
        ${isUrgent ? 'notification-scroll--urgent' : ''}
      `}
      style={{
        '--stack-index': stackIndex,
        '--animation-delay': `${stackIndex * 100}ms`,
      } as React.CSSProperties}
      role="alert"
      aria-label={config.ariaLabel}
    >
      {/* Wax seal indicator */}
      <div className="notification-scroll__seal" aria-hidden="true">
        <div className="notification-scroll__seal-wax">
          {config.seal}
        </div>
        <div className="notification-scroll__seal-ribbon" />
      </div>

      {/* Scroll content */}
      <div className="notification-scroll__content">
        {/* Icon + Title */}
        <div className="notification-scroll__header">
          <span className="notification-scroll__icon" aria-hidden="true">
            {config.icon}
          </span>
          <h3 className="notification-scroll__title">
            {notification.title}
          </h3>
        </div>

        {/* Message */}
        <p className="notification-scroll__message">
          {notification.message}
        </p>

        {/* Actions */}
        <div className="notification-scroll__actions">
          {notification.action && (
            <button
              className="notification-scroll__action-btn"
              onClick={handleAction}
              type="button"
            >
              {notification.action.label}
            </button>
          )}

          <button
            className="notification-scroll__dismiss-btn"
            onClick={handleDismiss}
            aria-label="Dismiss notification"
            type="button"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Torn edge decoration */}
      <div className="notification-scroll__torn-edge" aria-hidden="true" />
    </div>
  );
};

export default NotificationBanner;
