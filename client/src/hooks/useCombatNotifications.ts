/**
 * useCombatNotifications Hook
 *
 * Manages combat notification state and priority queue.
 * Integrates with CombatContext WebSocket events.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Notification } from '../components/combat/notifications/NotificationBanner';

export interface NotificationConfig {
  type: Notification['type'];
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number | null;
}

export function useCombatNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationIdCounter = useRef(0);

  /**
   * Add a new notification to the queue
   */
  const addNotification = useCallback((config: NotificationConfig) => {
    const id = `notification-${++notificationIdCounter.current}`;
    const newNotification: Notification = {
      id,
      ...config,
    };

    setNotifications(prev => [...prev, newNotification]);
    return id;
  }, []);

  /**
   * Dismiss a notification by ID
   */
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  /**
   * Clear all notifications
   */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  /**
   * Helper: Add GM request notification
   */
  const notifyGMRequest = useCallback((
    message: string,
    onRespond: () => void
  ) => {
    return addNotification({
      type: 'gm-request',
      title: 'GM Request',
      message,
      action: {
        label: 'Respond',
        onClick: onRespond,
      },
      duration: null, // Persistent
    });
  }, [addNotification]);

  /**
   * Helper: Add attack incoming notification
   */
  const notifyAttackIncoming = useCallback((
    attackerName: string,
    onDefend: () => void
  ) => {
    return addNotification({
      type: 'attack-incoming',
      title: 'Under Attack!',
      message: `${attackerName} is attacking you!`,
      action: {
        label: 'Defend',
        onClick: onDefend,
      },
      duration: null, // Persistent
    });
  }, [addNotification]);

  /**
   * Helper: Add turn warning notification
   */
  const notifyTurnWarning = useCallback((secondsRemaining: number) => {
    return addNotification({
      type: 'turn-warning',
      title: 'Turn Timer',
      message: `${secondsRemaining} seconds remaining!`,
      duration: 5000,
    });
  }, [addNotification]);

  /**
   * Helper: Add combat event notification
   */
  const notifyCombatEvent = useCallback((
    title: string,
    message: string
  ) => {
    return addNotification({
      type: 'combat-event',
      title,
      message,
      duration: 5000,
    });
  }, [addNotification]);

  /**
   * Helper: Add system notification
   */
  const notifySystem = useCallback((
    message: string,
    duration = 5000
  ) => {
    return addNotification({
      type: 'system',
      title: 'System',
      message,
      duration,
    });
  }, [addNotification]);

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAll,
    // Helpers
    notifyGMRequest,
    notifyAttackIncoming,
    notifyTurnWarning,
    notifyCombatEvent,
    notifySystem,
  };
}

export default useCombatNotifications;
