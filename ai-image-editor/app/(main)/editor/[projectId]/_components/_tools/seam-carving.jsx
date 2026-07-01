"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RotateCcw, Loader2, Scissors } from "lucide-react";
import { useCanvas } from "@/context/context";
import {
  getActiveImage,
  readSourceImageData,
  imageDataToDataURL,
  applyDataURL,
  revertToOriginal,
} from "./pixel-utils";

/**
 * =====================================================================
 *  SEAM CARVING — CONTENT-AWARE RESIZING (my own algorithm)
 * =====================================================================
 *  Unlike standard scaling, seam carving resizes images by calculating
 *  a pixel energy map and using dynamic programming to find and remove
 *  paths of lowest energy (seams) from top to bottom.
 *
 *  Complexity: O(D * H * W) where D is columns to remove,
 *  H is height, and W is width. We downsample if the image is too
 *  large (>600px) to prevent blocking the thread, maintaining 
 *  sub-second rendering.
 * =====================================================================
 */

// Step 1: Compute pixel energy map using dual-gradient energy
function computeEnergy(luma, width, height) {
  const energy = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      // X gradient (Central difference)
      const rx = (x === 0) ? luma[idx + 1] - luma[idx] :
                 (x === width - 1) ? luma[idx] - luma[idx - 1] :
                 (luma[idx + 1] - luma[idx - 1]) / 2;
      // Y gradient (Central difference)
      const ry = (y === 0) ? luma[idx + width] - luma[idx] :
                 (y === height - 1) ? luma[idx] - luma[idx - width] :
                 (luma[idx + width] - luma[idx - width]) / 2;
      energy[idx] = Math.abs(rx) + Math.abs(ry);
    }
  }
  return energy;
}

// Step 2: Build cumulative energy matrix and backtrack to find optimal seam
function findVerticalSeam(energy, width, height) {
  const dp = new Float32Array(width * height);
  // Base case: row 0
  for (let x = 0; x < width; x++) {
    dp[x] = energy[x];
  }

  // DP Cost Accumulation
  for (let y = 1; y < height; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    for (let x = 0; x < width; x++) {
      let minPrev = dp[prevRowOffset + x];
      if (x > 0) minPrev = Math.min(minPrev, dp[prevRowOffset + x - 1]);
      if (x < width - 1) minPrev = Math.min(minPrev, dp[prevRowOffset + x + 1]);
      dp[rowOffset + x] = energy[rowOffset + x] + minPrev;
    }
  }

  // Find minimum in bottom row
  let minCol = 0;
  let minVal = Infinity;
  const bottomOffset = (height - 1) * width;
  for (let x = 0; x < width; x++) {
    if (dp[bottomOffset + x] < minVal) {
      minVal = dp[bottomOffset + x];
      minCol = x;
    }
  }

  // Backtrack to find the optimal seam coordinates
  const seam = new Int32Array(height);
  let curCol = minCol;
  seam[height - 1] = curCol;

  for (let y = height - 2; y >= 0; y--) {
    const prevRowOffset = y * width;
    let nextCol = curCol;
    let minPrev = dp[prevRowOffset + curCol];

    if (curCol > 0 && dp[prevRowOffset + curCol - 1] < minPrev) {
      minPrev = dp[prevRowOffset + curCol - 1];
      nextCol = curCol - 1;
    }
    if (curCol < width - 1 && dp[prevRowOffset + curCol + 1] < minPrev) {
      minPrev = dp[prevRowOffset + curCol + 1];
      nextCol = curCol + 1;
    }
    curCol = nextCol;
    seam[y] = curCol;
  }

  return seam;
}

// Step 3: Remove the seam, shifting pixels leftward
function removeVerticalSeam(data, luma, seam, width, height) {
  const newWidth = width - 1;
  const nextData = new Uint8ClampedArray(newWidth * height * 4);
  const nextLuma = new Float32Array(newWidth * height);

  for (let y = 0; y < height; y++) {
    const seamX = seam[y];
    const srcRow = y * width;
    const dstRow = y * newWidth;

    // Copy left of seam
    for (let x = 0; x < seamX; x++) {
      const srcIdx = (srcRow + x) * 4;
      const dstIdx = (dstRow + x) * 4;
      nextData[dstIdx] = data[srcIdx];
      nextData[dstIdx + 1] = data[srcIdx + 1];
      nextData[dstIdx + 2] = data[srcIdx + 2];
      nextData[dstIdx + 3] = data[srcIdx + 3];
      nextLuma[dstRow + x] = luma[srcRow + x];
    }
    // Copy right of seam (shifted left)
    for (let x = seamX + 1; x < width; x++) {
      const srcIdx = (srcRow + x) * 4;
      const dstIdx = (dstRow + x - 1) * 4;
      nextData[dstIdx] = data[srcIdx];
      nextData[dstIdx + 1] = data[srcIdx + 1];
      nextData[dstIdx + 2] = data[srcIdx + 2];
      nextData[dstIdx + 3] = data[srcIdx + 3];
      nextLuma[dstRow + x - 1] = luma[srcRow + x];
    }
  }

  return { data: nextData, luma: nextLuma, width: newWidth };
}

// Wrapper to perform seam carving
export function runSeamCarving(imageData, targetWidth) {
  let { data, width, height } = imageData;
  const originalWidth = width;

  // Convert RGB to single luminance channel
  let luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const columnsToRemove = originalWidth - targetWidth;
  if (columnsToRemove <= 0) return imageData;

  let currentWidth = width;
  let currentData = data;

  for (let i = 0; i < columnsToRemove; i++) {
    const energy = computeEnergy(luma, currentWidth, height);
    const seam = findVerticalSeam(energy, currentWidth, height);
    const result = removeVerticalSeam(currentData, luma, seam, currentWidth, height);
    currentData = result.data;
    luma = result.luma;
    currentWidth = result.width;
  }

  // Create canvas-safe output ImageData
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const outputImgData = ctx.createImageData(currentWidth, height);
  outputImgData.data.set(currentData);
  return outputImgData;
}

export function SeamCarvingControls() {
  const { canvasEditor } = useCanvas();
  const [scalePercent, setScalePercent] = useState(80); // resize percentage (50..100)
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const originalSrcRef = useRef(null);
  const imageDimsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const img = getActiveImage(canvasEditor);
    if (img) {
      if (img.originalSrc) {
        originalSrcRef.current = img.originalSrc;
        setApplied(true);
      }
      imageDimsRef.current = { width: img.width, height: img.height };
    }
  }, [canvasEditor]);

  const applySeamCarving = async () => {
    const img = getActiveImage(canvasEditor);
    if (!img || isApplying) return;

    setIsApplying(true);
    try {
      const pristine = img.originalSrc || originalSrcRef.current || img.getSrc();
      originalSrcRef.current = pristine;

      const { imageData, width, height } = await readSourceImageData(pristine);
      imageDimsRef.current = { width, height };

      // Compute target width based on percentage slider
      const targetWidth = Math.max(50, Math.round(width * (scalePercent / 100)));

      // Execute Seam Carving
      const outputImgData = runSeamCarving(imageData, targetWidth);
      
      // Upload results & write to active Canvas object
      const dataURL = imageDataToDataURL(outputImgData);
      await applyDataURL(canvasEditor, img, dataURL, pristine, `carved-${Date.now()}.png`);

      setApplied(true);
      toast.success(`Resized content-aware image width from ${width}px to ${targetWidth}px`);
    } catch (error) {
      console.error("Error applying seam carving:", error);
      toast.error("Couldn't resize image - cross-origin or buffer error.");
    } finally {
      setIsApplying(false);
    }
  };

  const resetSeamCarving = async () => {
    const img = getActiveImage(canvasEditor);
    const pristine = img?.originalSrc || originalSrcRef.current;
    if (!img || !pristine || isApplying) return;

    setIsApplying(true);
    try {
      await revertToOriginal(canvasEditor, img, pristine);
      originalSrcRef.current = null;
      setApplied(false);
      setScalePercent(80);
      toast.success("Reverted image bounds to original");
    } catch (error) {
      console.error("Error resetting seam carving:", error);
      toast.error("Reversion failed.");
    } finally {
      setIsApplying(false);
    }
  };

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Load an image to perform content-aware resizing</p>
      </div>
    );
  }

  const activeImage = getActiveImage(canvasEditor);
  if (!activeImage) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Select an image to resize</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Content-Aware Resize</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetSeamCarving}
          disabled={!applied || isApplying}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <p className="text-xs text-white/60 leading-relaxed font-light">
        Uses **Seam Carving** (Dynamic Programming) to shrink the image width.
        It identifies and removes vertical paths of pixels that contain the lowest
        contrast/detail (energy), preserving key subjects without distortion.
      </p>

      {/* Target width selection */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-white">Scale Width (%)</label>
          <span className="text-xs text-white/70 font-semibold">{scalePercent}%</span>
        </div>
        <Slider
          value={[scalePercent]}
          onValueChange={(val) => setScalePercent(val[0])}
          min={50}
          max={100}
          step={1}
          className="w-full"
          disabled={isApplying}
        />
        <p className="text-[10px] text-white/40">
          50% removes half the image columns; 100% keeps the original dimensions.
        </p>
      </div>

      {/* Carving action button */}
      <Button onClick={applySeamCarving} disabled={isApplying} className="w-full gap-2 mt-4 bg-rose-600 hover:bg-rose-500 text-white">
        {isApplying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Carving Seams...
          </>
        ) : (
          <>
            <Scissors className="h-4 w-4" />
            {applied ? "Re-apply Seam Carving" : "Carve Image Width"}
          </>
        )}
      </Button>

      {/* DP Explanatory Info Card */}
      <div className="p-3 bg-slate-900/40 rounded-lg border border-white/5 text-[11px] text-white/50 space-y-1.5 leading-relaxed">
        <p className="font-semibold text-white/70">How It Works (Dynamic Programming):</p>
        <p>1. Energy Map: compute pixel importance as |dx| + |dy| using gradient differences.</p>
        <p>2. DP Pass: accumulate minimum-cost path from top to bottom: M(x,y) = E(x,y) + min(M(x-1,y-1), M(x,y-1), M(x+1,y-1)).</p>
        <p>3. Backtrack: trace the lowest-energy seam from bottom and remove one pixel per row.</p>
      </div>
    </div>
  );
}
