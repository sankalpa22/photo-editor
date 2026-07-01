"use client";

import React, { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RotateCcw, Droplet, Eye, Check } from "lucide-react";
import { useCanvas } from "@/context/context";
import { getActiveImage } from "./pixel-utils";
import { FabricImage } from "fabric";
import { toast } from "sonner";

/**
 * Generates a 1D Gaussian kernel.
 */
function getGaussianKernel(radius, sigma) {
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;

  for (let i = 0; i < size; i++) {
    const x = i - radius;
    // G(x) = exp(-x^2 / (2 * sigma^2))
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }

  // Normalize
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }

  return kernel;
}

/**
 * 1. STANDALONE GAUSSIAN BLUR
 * Uses separable convolution (horizontal convolve first, then vertical)
 * Edge handling: replicating border values.
 */
export function applyGaussianBlur(imageData, radius) {
  if (radius <= 0) return imageData;

  const { width, height } = imageData;
  const src = imageData.data;
  const temp = new Uint8ClampedArray(src.length);
  const dst = new Uint8ClampedArray(src.length);

  const sigma = Math.max(radius / 2, 0.5);
  const kernel = getGaussianKernel(radius, sigma);

  // Horizontal Pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let k = -radius; k <= radius; k++) {
        // Replicate border values
        const nx = Math.max(0, Math.min(width - 1, x + k));
        const idx = rowOffset + nx * 4;
        const weight = kernel[k + radius];

        r += src[idx] * weight;
        g += src[idx + 1] * weight;
        b += src[idx + 2] * weight;
        a += src[idx + 3] * weight;
      }

      const outIdx = rowOffset + x * 4;
      temp[outIdx] = r;
      temp[outIdx + 1] = g;
      temp[outIdx + 2] = b;
      temp[outIdx + 3] = a;
    }
  }

  // Vertical Pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const colOffset = x * 4;

      for (let k = -radius; k <= radius; k++) {
        // Replicate border values
        const ny = Math.max(0, Math.min(height - 1, y + k));
        const idx = ny * width * 4 + colOffset;
        const weight = kernel[k + radius];

        r += temp[idx] * weight;
        g += temp[idx + 1] * weight;
        b += temp[idx + 2] * weight;
        a += temp[idx + 3] * weight;
      }

      const outIdx = y * width * 4 + colOffset;
      dst[outIdx] = r;
      dst[outIdx + 1] = g;
      dst[outIdx + 2] = b;
      dst[outIdx + 3] = a;
    }
  }

  return new ImageData(dst, width, height);
}

/**
 * 2. STANDALONE BACKGROUND BLUR (NO AI/ML)
 * Algorithm:
 * - Grayscale Laplacian response focus map.
 * - Normalize and binarize using a user-specified focus threshold.
 * - Apply a box/Gaussian filter to feather the binarized mask.
 * - Composite original & blurred pixels based on mask values.
 */
export function applyBackgroundBlur(imageData, blurRadius, focusThreshold = 25, maskFeather = 8) {
  const { width, height } = imageData;
  const src = imageData.data;

  // 1. Grayscale Conversion
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    gray[p] = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
  }

  // 2. Laplacian Absolute Response Focus Map
  // Kernel:
  // [ -1, -1, -1 ]
  // [ -1,  8, -1 ]
  // [ -1, -1, -1 ]
  const laplacian = new Float32Array(width * height);
  let maxLap = 0.001; // Avoid division by zero

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;

      // 3x3 Convolution
      for (let ky = -1; ky <= 1; ky++) {
        const ny = Math.max(0, Math.min(height - 1, y + ky));
        const rowOffset = ny * width;

        for (let kx = -1; kx <= 1; kx++) {
          const nx = Math.max(0, Math.min(width - 1, x + kx));
          const val = gray[rowOffset + nx];
          const weight = (kx === 0 && ky === 0) ? 8 : -1;
          sum += val * weight;
        }
      }

      const absVal = Math.abs(sum);
      laplacian[y * width + x] = absVal;
      if (absVal > maxLap) maxLap = absVal;
    }
  }

  // 3. Normalize & Threshold to binarize (foreground = 255, background = 0)
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0; i < laplacian.length; i++) {
    const norm = (laplacian[i] / maxLap) * 255;
    mask[i] = norm >= focusThreshold ? 255 : 0;
  }

  // 4. Refine Mask: Smooth the mask using a box blur to feather the binarized boundaries
  const featheredMask = new Float32Array(width * height);
  const fRadius = Math.max(1, maskFeather);
  const fSize = fRadius * 2 + 1;

  // Horizontal blur pass on mask
  const mTemp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let mSum = 0;
      for (let k = -fRadius; k <= fRadius; k++) {
        const nx = Math.max(0, Math.min(width - 1, x + k));
        mSum += mask[rowOffset + nx];
      }
      mTemp[rowOffset + x] = mSum / fSize;
    }
  }

  // Vertical blur pass on mask
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let mSum = 0;
      for (let k = -fRadius; k <= fRadius; k++) {
        const ny = Math.max(0, Math.min(height - 1, y + k));
        mSum += mTemp[ny * width + x];
      }
      featheredMask[y * width + x] = mSum / fSize;
    }
  }

  // 5. Composite: Original image and blurred version
  const blurredImage = applyGaussianBlur(imageData, blurRadius);
  const blurred = blurredImage.data;
  const dst = new Uint8ClampedArray(src.length);

  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    // Normalised mask weight [0, 1]
    const w = featheredMask[p] / 255;

    // Blend: Foreground shows original (w=1), background shows blurred (w=0)
    dst[i] = src[i] * w + blurred[i] * (1 - w);
    dst[i + 1] = src[i + 1] * w + blurred[i + 1] * (1 - w);
    dst[i + 2] = src[i + 2] * w + blurred[i + 2] * (1 - w);
    dst[i + 3] = src[i + 3]; // Preserve alpha
  }

  return new ImageData(dst, width, height);
}

export function BlurControls() {
  const { canvasEditor, setProcessingMessage } = useCanvas();
  const [radius, setRadius] = useState(10);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);
  const [focusThreshold, setFocusThreshold] = useState(25);
  const [maskFeather, setMaskFeather] = useState(12);

  const [isApplying, setIsApplying] = useState(false);
  const [originalImageData, setOriginalImageData] = useState(null);

  // Helper to read the image data from fabric object
  const fetchOriginalImageData = async (imageObject) => {
    if (!imageObject) return null;

    // Cache the original src so we don't reload from network every time
    const srcUrl = imageObject.originalSrc || imageObject.getSrc();
    if (!imageObject.originalSrc) {
      imageObject.originalSrc = srcUrl;
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight));
      };
      img.onerror = () => resolve(null);
      img.src = srcUrl;
    });
  };

  const handleApplyBlur = async () => {
    const imageObject = getActiveImage(canvasEditor);
    if (!imageObject || isApplying) {
      toast.error("No active image found to blur");
      return;
    }

    setIsApplying(true);
    setProcessingMessage(isBackgroundMode ? "Separating Background..." : "Applying Gaussian Blur...");

    try {
      // 1. Fetch image raw pixel data
      let baseData = originalImageData;
      if (!baseData) {
        baseData = await fetchOriginalImageData(imageObject);
        setOriginalImageData(baseData);
      }

      if (!baseData) {
        throw new Error("Could not decode image pixel buffer");
      }

      // 2. Compute blur
      let processedData;
      if (isBackgroundMode) {
        processedData = applyBackgroundBlur(baseData, radius, focusThreshold, maskFeather);
      } else {
        processedData = applyGaussianBlur(baseData, radius);
      }

      // 3. Write pixels back to canvas
      const canvas = document.createElement("canvas");
      canvas.width = processedData.width;
      canvas.height = processedData.height;
      const ctx = canvas.getContext("2d");
      ctx.putImageData(processedData, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");

      // Apply to Fabric.js active object
      imageObject.setSrc(dataUrl, () => {
        canvasEditor.requestRenderAll();
        setIsApplying(false);
        setProcessingMessage(null);
        toast.success(isBackgroundMode ? "Background blurred successfully!" : "Gaussian blur applied!");
      });
    } catch (error) {
      console.error(error);
      toast.error("An error occurred while running the blur filter.");
      setIsApplying(false);
      setProcessingMessage(null);
    }
  };

  const handleReset = () => {
    const imageObject = getActiveImage(canvasEditor);
    if (!imageObject || !imageObject.originalSrc) {
      toast.error("No original source to restore");
      return;
    }

    setProcessingMessage("Restoring original image...");
    imageObject.setSrc(imageObject.originalSrc, () => {
      canvasEditor.requestRenderAll();
      setOriginalImageData(null);
      setProcessingMessage(null);
      toast.success("Image reset to original!");
    });
  };

  // Re-fetch original if active object changes
  useEffect(() => {
    setOriginalImageData(null);
  }, [canvasEditor]);

  if (!canvasEditor) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Blur Filters</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      {/* Blur Mode Switcher */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-slate-900/50">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium text-white flex items-center gap-1.5">
            <Droplet className="h-4 w-4 text-cyan-400" />
            Background Defocus
          </Label>
          <span className="text-[11px] text-white/50 block leading-tight">
            Keep foreground sharp, blur only background
          </span>
        </div>
        <Switch
          checked={isBackgroundMode}
          onCheckedChange={setIsBackgroundMode}
        />
      </div>

      {/* Radius Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-white">Blur Radius</label>
          <span className="text-xs text-white/70">{radius}px</span>
        </div>
        <Slider
          value={[radius]}
          onValueChange={(val) => setRadius(val[0])}
          min={1}
          max={40}
          step={1}
          className="w-full"
        />
      </div>

      {/* Focus Threshold (Only in background mode) */}
      {isBackgroundMode && (
        <>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm text-white flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-cyan-400" />
                Focus Sensitivity
              </label>
              <span className="text-xs text-white/70">{focusThreshold}</span>
            </div>
            <Slider
              value={[focusThreshold]}
              onValueChange={(val) => setFocusThreshold(val[0])}
              min={5}
              max={80}
              step={1}
              className="w-full"
            />
            <span className="text-[10px] text-white/40 block leading-relaxed">
              Lower threshold captures more edges (makes foreground wider). Higher threshold blurs everything except the sharpest details.
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm text-white">Mask Transition (Feather)</label>
              <span className="text-xs text-white/70">{maskFeather}px</span>
            </div>
            <Slider
              value={[maskFeather]}
              onValueChange={(val) => setMaskFeather(val[0])}
              min={2}
              max={25}
              step={1}
              className="w-full"
            />
          </div>
        </>
      )}

      {/* Action Button */}
      <Button
        onClick={handleApplyBlur}
        disabled={isApplying}
        className="w-full bg-gradient-to-r from-primary to-sky-600 hover:shadow-lg hover:shadow-primary/20 text-white font-semibold rounded-xl h-11 transition-all"
      >
        <Check className="h-4 w-4 mr-2" />
        {isApplying ? "Filtering Pixels..." : "Apply Smoothing Filter"}
      </Button>

      {/* Academic/Mathematical Card */}
      <div className="p-3 bg-slate-900/40 rounded-lg border border-white/5 text-[11px] text-white/50 space-y-1.5 leading-relaxed">
        <p className="font-semibold text-white/70">How It Works (Separable Convolution):</p>
        <p>
          1. **Separability:** Converts a 2D Gaussian pass into sequential horizontal and vertical 1D convolutions. This reduces complexity from O(R^2) to O(2R) per pixel.
        </p>
        <p>
          2. **Laplacian Focus Map:** Grayscale image convolved with a 3x3 Laplacian edge response kernel. High local gradient changes represent sharp foreground details.
        </p>
        <p>
          3. **Alpha Feathering:** The binarized focus map is blurred to create a smooth alpha weight mask, avoiding harsh edges in the composite.
        </p>
      </div>
    </div>
  );
}
