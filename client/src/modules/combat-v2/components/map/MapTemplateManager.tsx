/**
 * Combat V2 - Map Template Manager
 *
 * Manages saving and loading combat map templates.
 * Allows GMs to create reusable map configurations.
 */

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../../api/supabaseClient";
import type { GridConfig, MapConfig } from "../../../../api/combatV2Socket";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MapTemplate {
  id: string;
  campaign_id: string;
  created_by: string;
  name: string;
  description: string | null;
  image_key: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  grid_rows: number;
  grid_cols: number;
  cell_size: number;
  offset_x: number;
  offset_y: number;
  grid_visible: boolean;
  grid_opacity: number;
  created_at: string;
  updated_at: string;
}

export interface MapTemplateManagerProps {
  campaignId: string;
  currentGridConfig: GridConfig;
  currentMapConfig: MapConfig;
  onLoadTemplate: (template: MapTemplate) => void;
  isGM: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function MapTemplateManager({
  campaignId,
  currentGridConfig,
  currentMapConfig,
  onLoadTemplate,
  isGM,
}: MapTemplateManagerProps) {
  const [templates, setTemplates] = useState<MapTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("combat_map_templates")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setTemplates(data || []);
    } catch (err) {
      console.error("Failed to load map templates:", err);
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Save current configuration as template
  const handleSaveTemplate = useCallback(async () => {
    if (!saveName.trim()) {
      setError("Template name is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw new Error("User not authenticated");
      }

      const template: Partial<MapTemplate> = {
        campaign_id: campaignId,
        created_by: userData.user.id,
        name: saveName.trim(),
        description: saveDescription.trim() || null,
        image_key: currentMapConfig.imageKey,
        image_url: currentMapConfig.imageUrl,
        image_width: currentMapConfig.imageWidth,
        image_height: currentMapConfig.imageHeight,
        grid_rows: currentGridConfig.rows,
        grid_cols: currentGridConfig.cols,
        cell_size: currentGridConfig.cellSize,
        offset_x: currentGridConfig.offsetX,
        offset_y: currentGridConfig.offsetY,
        grid_visible: currentGridConfig.visible,
        grid_opacity: currentGridConfig.opacity,
      };

      const { error: insertError } = await supabase
        .from("combat_map_templates")
        .insert(template);

      if (insertError) throw insertError;

      // Reload templates
      await loadTemplates();

      // Reset form
      setSaveName("");
      setSaveDescription("");
      setShowSaveModal(false);
    } catch (err) {
      console.error("Failed to save template:", err);
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  }, [
    campaignId,
    saveName,
    saveDescription,
    currentGridConfig,
    currentMapConfig,
    loadTemplates,
  ]);

  // Delete template
  const handleDeleteTemplate = useCallback(
    async (templateId: string) => {
      if (!confirm("Are you sure you want to delete this template?")) {
        return;
      }

      try {
        setError(null);

        const { error: deleteError } = await supabase
          .from("combat_map_templates")
          .delete()
          .eq("id", templateId);

        if (deleteError) throw deleteError;

        await loadTemplates();
      } catch (err) {
        console.error("Failed to delete template:", err);
        setError(err instanceof Error ? err.message : "Failed to delete template");
      }
    },
    [loadTemplates]
  );

  if (loading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <p className="text-slate-400 text-center">Loading templates...</p>
      </div>
    );
  }

  return (
    <div className="map-template-manager bg-slate-800 border border-slate-700 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="text-lg font-semibold text-slate-200">Map Templates</h3>
        {isGM && (
          <button
            onClick={() => setShowSaveModal(true)}
            className="text-sm px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
          >
            Save Current
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="m-4 p-3 bg-red-900/30 border border-red-700/60 rounded text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Template list */}
      <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
        {templates.length === 0 ? (
          <p className="text-slate-500 text-center py-4">
            No templates saved yet
          </p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="bg-slate-900/50 border border-slate-700 rounded p-3 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-200 truncate">
                    {template.name}
                  </h4>
                  {template.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                    <span>Grid: {template.grid_rows}×{template.grid_cols}</span>
                    <span>Cell: {template.cell_size}px</span>
                    {template.image_width && template.image_height && (
                      <span>Image: {template.image_width}×{template.image_height}px</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onLoadTemplate(template)}
                    className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    Load
                  </button>
                  {isGM && (
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-slate-200 mb-4">
              Save Map Template
            </h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="template-name" className="block text-sm font-medium text-slate-300 mb-1">
                  Template Name *
                </label>
                <input
                  id="template-name"
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., Forest Clearing"
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500"
                  disabled={saving}
                />
              </div>

              <div>
                <label htmlFor="template-description" className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  id="template-description"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 resize-none"
                  disabled={saving}
                />
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <p>Current configuration:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-500">
                  <li>Grid: {currentGridConfig.rows}×{currentGridConfig.cols}</li>
                  <li>Cell size: {currentGridConfig.cellSize}px</li>
                  <li>Offset: ({currentGridConfig.offsetX}, {currentGridConfig.offsetY})</li>
                  {currentMapConfig.imageUrl && (
                    <li>Map image included</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveTemplate}
                disabled={saving || !saveName.trim()}
                className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium transition-colors"
              >
                {saving ? "Saving..." : "Save Template"}
              </button>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveName("");
                  setSaveDescription("");
                  setError(null);
                }}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapTemplateManager;
