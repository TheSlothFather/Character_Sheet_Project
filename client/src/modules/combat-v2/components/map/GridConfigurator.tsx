/**
 * Combat V2 - Grid Configurator Component
 *
 * Controls for adjusting grid parameters (rows, columns, cell size, offsets).
 */

import React from "react";
import type { GridConfig } from "../../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GridConfiguratorProps {
  /** Current grid configuration */
  config: GridConfig;
  /** Called when configuration changes */
  onChange: (config: GridConfig) => void;
  /** Optional image dimensions for reference */
  imageSize?: { width: number; height: number };
  /** Disabled state (e.g., during combat) */
  disabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function GridConfigurator({
  config,
  onChange,
  imageSize,
  disabled = false,
}: GridConfiguratorProps) {
  const handleChange = (key: keyof GridConfig, value: number | boolean) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  const suggestGridSize = () => {
    if (!imageSize) return;

    // Suggest grid based on image size (aiming for ~50px cells)
    const suggestedCellSize = 50;
    const suggestedCols = Math.floor(imageSize.width / suggestedCellSize);
    const suggestedRows = Math.floor(imageSize.height / suggestedCellSize);

    onChange({
      ...config,
      rows: suggestedRows,
      cols: suggestedCols,
      cellSize: suggestedCellSize,
      offsetX: 0,
      offsetY: 0,
    });
  };

  return (
    <div className="grid-configurator space-y-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-100">Grid Configuration</h3>
        {imageSize && (
          <button
            onClick={suggestGridSize}
            disabled={disabled}
            className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Auto-fit to Image
          </button>
        )}
      </div>

      {/* Grid Dimensions */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-300">Grid Dimensions</h4>

        {/* Rows */}
        <div>
          <label htmlFor="grid-rows" className="block text-sm text-gray-400 mb-1">
            Rows: {config.rows}
          </label>
          <input
            id="grid-rows"
            type="range"
            min="5"
            max="100"
            value={config.rows}
            onChange={(e) => handleChange("rows", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Columns */}
        <div>
          <label htmlFor="grid-cols" className="block text-sm text-gray-400 mb-1">
            Columns: {config.cols}
          </label>
          <input
            id="grid-cols"
            type="range"
            min="5"
            max="100"
            value={config.cols}
            onChange={(e) => handleChange("cols", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Cell Size */}
      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-2">Cell Size</h4>
        <div>
          <label htmlFor="cell-size" className="block text-sm text-gray-400 mb-1">
            Size: {config.cellSize}px
          </label>
          <input
            id="cell-size"
            type="range"
            min="20"
            max="80"
            value={config.cellSize}
            onChange={(e) => handleChange("cellSize", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Grid Alignment */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-300">Grid Alignment</h4>

        {/* X Offset */}
        <div>
          <label htmlFor="offset-x" className="block text-sm text-gray-400 mb-1">
            X Offset: {config.offsetX}px
          </label>
          <input
            id="offset-x"
            type="range"
            min="-200"
            max="200"
            value={config.offsetX}
            onChange={(e) => handleChange("offsetX", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Y Offset */}
        <div>
          <label htmlFor="offset-y" className="block text-sm text-gray-400 mb-1">
            Y Offset: {config.offsetY}px
          </label>
          <input
            id="offset-y"
            type="range"
            min="-200"
            max="200"
            value={config.offsetY}
            onChange={(e) => handleChange("offsetY", parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Reset Alignment */}
        <button
          onClick={() => onChange({ ...config, offsetX: 0, offsetY: 0 })}
          disabled={disabled || (config.offsetX === 0 && config.offsetY === 0)}
          className="w-full text-xs px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset Alignment
        </button>
      </div>

      {/* Grid Appearance */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-300">Grid Appearance</h4>

        {/* Visibility Toggle */}
        <div className="flex items-center justify-between">
          <label htmlFor="grid-visible" className="text-sm text-gray-400">
            Show Grid Lines
          </label>
          <input
            id="grid-visible"
            type="checkbox"
            checked={config.visible}
            onChange={(e) => handleChange("visible", e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Opacity */}
        {config.visible && (
          <div>
            <label htmlFor="grid-opacity" className="block text-sm text-gray-400 mb-1">
              Grid Opacity: {Math.round(config.opacity * 100)}%
            </label>
            <input
              id="grid-opacity"
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={config.opacity}
              onChange={(e) => handleChange("opacity", parseFloat(e.target.value))}
              disabled={disabled}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        )}
      </div>

      {/* Info */}
      {imageSize && (
        <div className="pt-4 border-t border-gray-700 text-xs text-gray-400 space-y-1">
          <p>Image: {imageSize.width} × {imageSize.height}px</p>
          <p>Grid: {config.cols * config.cellSize} × {config.rows * config.cellSize}px</p>
        </div>
      )}
    </div>
  );
}

export default GridConfigurator;
