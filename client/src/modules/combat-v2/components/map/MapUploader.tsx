/**
 * Combat V2 - Map Uploader Component
 *
 * Handles battle map image uploads to R2 storage.
 */

import React, { useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MapUploaderProps {
  /** Combat ID for upload path */
  combatId: string;
  /** Called when upload completes successfully */
  onUploadComplete: (imageUrl: string, dimensions: { width: number; height: number }) => void;
  /** Called when an error occurs */
  onError: (error: string) => void;
  /** Maximum file size in MB (default 15) */
  maxSizeMB?: number;
  /** Existing image URL if updating */
  currentImageUrl?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function MapUploader({
  combatId,
  onUploadComplete,
  onError,
  maxSizeMB = 15,
  currentImageUrl,
}: MapUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      onError("Please select an image file");
      return;
    }

    // Validate file size
    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      onError(`File size must be less than ${maxSizeMB} MB`);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create FormData
      const formData = new FormData();
      formData.append("file", file);

      // Get worker URL from environment
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      if (!workerUrl) {
        throw new Error("Worker URL not configured");
      }

      // Upload to worker
      const response = await fetch(`${workerUrl}/api/combat/${encodeURIComponent(combatId)}/map/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();

      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        onUploadComplete(result.imageUrl, {
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setIsUploading(false);
        setUploadProgress(100);
      };
      img.onerror = () => {
        onError("Failed to load uploaded image");
        setIsUploading(false);
      };
      img.src = result.imageUrl;
    } catch (error) {
      console.error("Upload error:", error);
      onError(error instanceof Error ? error.message : "Upload failed");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="map-uploader space-y-4">
      {/* File input */}
      <div>
        <label
          htmlFor="map-file-input"
          className="block text-sm font-medium text-gray-200 mb-2"
        >
          Battle Map Image
        </label>
        <input
          ref={fileInputRef}
          id="map-file-input"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={isUploading}
          className="block w-full text-sm text-gray-300
            file:mr-4 file:py-2 file:px-4
            file:rounded file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-600 file:text-white
            hover:file:bg-blue-700
            file:cursor-pointer cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-gray-400">
          Upload a battle map image (max {maxSizeMB} MB)
        </p>
      </div>

      {/* Upload progress */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300">Uploading...</span>
            <span className="text-gray-400">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Preview */}
      {previewUrl && !isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-200">Preview</span>
            <button
              onClick={handleRemove}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Remove
            </button>
          </div>
          <div className="relative border border-gray-700 rounded-lg overflow-hidden">
            <img
              src={previewUrl}
              alt="Battle map preview"
              className="w-full h-auto max-h-64 object-contain bg-gray-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default MapUploader;
