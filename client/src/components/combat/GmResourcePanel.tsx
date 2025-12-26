/**
 * GmResourcePanel Component
 *
 * Comprehensive GM resource management for Energy and AP.
 * - Quick adjustment buttons (+1, -1, +5, -5)
 * - Numeric input for precise adjustments
 * - Add modifiers (increase/decrease max, temporary boosts)
 * - View and remove active modifiers
 * - Shows base max vs effective max
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";

export interface ResourceModifier {
  id: string;
  type: 'add_max' | 'reduce_max' | 'add_current';
  amount: number;
  duration: number | null;
  source: string;
  createdAt: string;
}

export interface GmResourcePanelProps {
  entity: CombatEntity;
  onAdjustResource: (resource: 'ap' | 'energy', delta: number) => Promise<void>;
  onAddModifier: (
    resource: 'ap' | 'energy',
    modifierType: ResourceModifier['type'],
    amount: number,
    duration: number | null,
    source: string
  ) => Promise<void>;
  onRemoveModifier: (resource: 'ap' | 'energy', modifierId: string) => Promise<void>;
  className?: string;
}

export const GmResourcePanel: React.FC<GmResourcePanelProps> = ({
  entity,
  onAdjustResource,
  onAddModifier,
  onRemoveModifier,
  className = "",
}) => {
  const [customAmount, setCustomAmount] = React.useState<string>("");
  const [showModifierDialog, setShowModifierDialog] = React.useState<'ap' | 'energy' | null>(null);
  const [modifierForm, setModifierForm] = React.useState({
    type: 'add_max' as ResourceModifier['type'],
    amount: 5,
    duration: null as number | null,
    source: '',
  });

  const handleQuickAdjust = async (resource: 'ap' | 'energy', delta: number) => {
    await onAdjustResource(resource, delta);
  };

  const handleCustomAdjust = async (resource: 'ap' | 'energy') => {
    const delta = parseInt(customAmount, 10);
    if (!isNaN(delta)) {
      await onAdjustResource(resource, delta);
      setCustomAmount("");
    }
  };

  const handleAddModifier = async () => {
    if (!showModifierDialog || !modifierForm.source) return;

    await onAddModifier(
      showModifierDialog,
      modifierForm.type,
      modifierForm.amount,
      modifierForm.duration,
      modifierForm.source
    );

    setShowModifierDialog(null);
    setModifierForm({
      type: 'add_max',
      amount: 5,
      duration: null,
      source: '',
    });
  };

  const renderResourceControls = (resource: 'ap' | 'energy') => {
    const resourceData = entity[resource];
    const label = resource === 'ap' ? 'AP' : 'Energy';

    return (
      <div className="resource-controls" key={resource}>
        <div className="resource-header">
          <h4>{label}</h4>
          <div className="resource-values">
            <span className="current">{resourceData.current}</span>
            <span className="separator">/</span>
            <span className="max">{resourceData.max}</span>
            {resourceData.baseMax !== resourceData.max && (
              <span className="base-max" title="Base maximum">(base: {resourceData.baseMax})</span>
            )}
          </div>
        </div>

        <div className="quick-adjustments">
          <button onClick={() => handleQuickAdjust(resource, -5)} className="adjust-btn adjust-btn--minus">-5</button>
          <button onClick={() => handleQuickAdjust(resource, -1)} className="adjust-btn adjust-btn--minus">-1</button>
          <button onClick={() => handleQuickAdjust(resource, 1)} className="adjust-btn adjust-btn--plus">+1</button>
          <button onClick={() => handleQuickAdjust(resource, 5)} className="adjust-btn adjust-btn--plus">+5</button>
        </div>

        <div className="custom-adjustment">
          <input
            type="number"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Custom amount"
            className="custom-input"
          />
          <button onClick={() => handleCustomAdjust(resource)} className="apply-btn">Apply</button>
        </div>

        <button
          onClick={() => setShowModifierDialog(resource)}
          className="add-modifier-btn"
        >
          Add Modifier
        </button>

        {resourceData.modifiers && resourceData.modifiers.length > 0 && (
          <div className="active-modifiers">
            <h5>Active Modifiers</h5>
            <ul className="modifier-list">
              {resourceData.modifiers.map((mod) => (
                <li key={mod.id} className="modifier-item">
                  <span className="modifier-info">
                    <strong>{mod.source}</strong>
                    {mod.type === 'add_max' && ` +${mod.amount} max`}
                    {mod.type === 'reduce_max' && ` -${mod.amount} max`}
                    {mod.type === 'add_current' && ` +${mod.amount} current`}
                    {mod.duration !== null && ` (${mod.duration} rounds)`}
                  </span>
                  <button
                    onClick={() => onRemoveModifier(resource, mod.id)}
                    className="remove-modifier-btn"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`gm-resource-panel ${className}`}>
      <h3>Resource Management</h3>
      <div className="resources-container">
        {renderResourceControls('energy')}
        {renderResourceControls('ap')}
      </div>

      {showModifierDialog && (
        <div className="modifier-dialog-overlay" onClick={() => setShowModifierDialog(null)}>
          <div className="modifier-dialog" onClick={(e) => e.stopPropagation()}>
            <h4>Add {showModifierDialog.toUpperCase()} Modifier</h4>

            <div className="form-field">
              <label>Type</label>
              <select
                value={modifierForm.type}
                onChange={(e) => setModifierForm({ ...modifierForm, type: e.target.value as ResourceModifier['type'] })}
              >
                <option value="add_max">Increase Maximum</option>
                <option value="reduce_max">Decrease Maximum</option>
                <option value="add_current">Temporary Boost</option>
              </select>
            </div>

            <div className="form-field">
              <label>Amount</label>
              <input
                type="number"
                value={modifierForm.amount}
                onChange={(e) => setModifierForm({ ...modifierForm, amount: parseInt(e.target.value) || 0 })}
                min="1"
              />
            </div>

            <div className="form-field">
              <label>
                <input
                  type="checkbox"
                  checked={modifierForm.duration !== null}
                  onChange={(e) => setModifierForm({ ...modifierForm, duration: e.target.checked ? 3 : null })}
                />
                Expires after rounds
              </label>
              {modifierForm.duration !== null && (
                <input
                  type="number"
                  value={modifierForm.duration}
                  onChange={(e) => setModifierForm({ ...modifierForm, duration: parseInt(e.target.value) || 1 })}
                  min="1"
                  className="duration-input"
                />
              )}
            </div>

            <div className="form-field">
              <label>Source/Reason</label>
              <input
                type="text"
                value={modifierForm.source}
                onChange={(e) => setModifierForm({ ...modifierForm, source: e.target.value })}
                placeholder="e.g., Blessing of Strength"
              />
            </div>

            <div className="dialog-actions">
              <button onClick={() => setShowModifierDialog(null)} className="cancel-btn">Cancel</button>
              <button
                onClick={handleAddModifier}
                disabled={!modifierForm.source}
                className="confirm-btn"
              >
                Add Modifier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GmResourcePanel;
