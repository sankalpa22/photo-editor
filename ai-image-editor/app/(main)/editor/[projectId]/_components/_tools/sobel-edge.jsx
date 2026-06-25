"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Grid3x3, RotateCcw, Loader2 } from "lucide-react";
import { useCanvas } from "@/context/context";
import {
  getActiveImage,
  readSourceImageData,
  toLuminance,
  scalarToDataURL,
  applyDataURL,
  revertToOriginal,
} from "./pixel-utils";

/**
 * =====================================================================
 *  EDGE DETECTION  —  SOBEL OPERATOR (my own algorithm)
 * =====================================================================
 *  A convolution-based edge detector. It approximates the image gradient
 *  with two 3x3 kernels and reports the gradient magnitude per pixel, so
 *  sharp brightness changes (edges) light up and flat areas go dark.
 *
 *    Gx = [-1 0 +1]      Gy = [-1 -2 -1]
 *         [-2 0 +2]           [ 0  0  0]
 *         [-1 0 +1]           [+1 +2 +1]
 *
 *    magnitude = sqrt(Gx^2 + Gy^2)
 *
 *  Complexity: O(N) — a fixed 9-tap convolution at every pixel.
 * =====================================================================
 */

/**
 * Convolve a luminance buffer with the Sobel kernels and return the gradient
 * magnitude for every pixel (clamped to 0..255). Border pixels have no full
 * 3x3 neighbourhood, so they are left at 0.
 *
 * @param {Uint8ClampedArray} luma   one brightness byte per pixel
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} edge strength per pixel
 */
export function sobelMagnitude(luma, width, height) {
  const mag = new Uint8ClampedArray(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;

      const tl = luma[i - width - 1];
      const tc = luma[i - width];
      const tr = luma[i - width + 1];
      const ml = luma[i - 1];
      const mr = luma[i + 1];
      const bl = luma[i + width - 1];
      const bc = luma[i + width];
      const br = luma[i + width + 1];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      // Uint8ClampedArray rounds and clamps the sqrt into 0..255 for us.
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return mag;
}

export function SobelControls() {
  const { canvasEditor } = useCanvas();
  const [threshold, setThreshold] = useState(0); // 0 = raw magnitude
  const [invert, setInvert] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [hasCache, setHasCache] = useState(false);

  const originalSrcRef = useRef(null);
  const magRef = useRef(null); // { data, width, height } — cached edge map
  const renderLock = useRef(false);

  // Pick up an already-processed image after a reload so Reset still works.
  useEffect(() => {
    const img = getActiveImage(canvasEditor);
    if (img?.originalSrc) {
      originalSrcRef.current = img.originalSrc;
      setApplied(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasEditor]);

  // Map an edge-strength value to a final gray, honouring threshold + invert.
  const edgeMap = (thr, inv) => (v) => {
    const m = thr > 0 ? (v >= thr ? 255 : 0) : v;
    return inv ? 255 - m : m;
  };

  // Re-paint from the cached edge map — convolution is skipped (it's cached);
  // the result is uploaded so the saved project stays small.
  const renderFromCache = async (thr, inv) => {
    const cache = magRef.current;
    const img = getActiveImage(canvasEditor);
    if (!cache || !img || renderLock.current) return;
    renderLock.current = true;
    setIsApplying(true);
    try {
      const dataURL = scalarToDataURL(
        cache.data,
        cache.width,
        cache.height,
        edgeMap(thr, inv)
      );
      await applyDataURL(
        canvasEditor,
        img,
        dataURL,
        originalSrcRef.current,
        `edges-${Date.now()}.png`
      );
    } catch (error) {
      console.error("Error rendering edges:", error);
      toast.error("Couldn't save the change — please try again.");
    } finally {
      renderLock.current = false;
      setIsApplying(false);
    }
  };

  const applySobel = async () => {
    const img = getActiveImage(canvasEditor);
    if (!img || isApplying) return;

    setIsApplying(true);
    try {
      const pristine =
        img.originalSrc || originalSrcRef.current || img.getSrc();
      originalSrcRef.current = pristine;

      const { imageData, width, height } = await readSourceImageData(pristine);
      const luma = toLuminance(imageData.data);

      // ---- the algorithm ----
      const mag = sobelMagnitude(luma, width, height);
      magRef.current = { data: mag, width, height };
      setHasCache(true);

      const dataURL = scalarToDataURL(
        mag,
        width,
        height,
        edgeMap(threshold, invert)
      );
      await applyDataURL(canvasEditor, img, dataURL, pristine, `edges-${Date.now()}.png`);

      setApplied(true);
      toast.success("Edge detection applied");
    } catch (error) {
      console.error("Error applying edge detection:", error);
      toast.error(
        "Couldn't run edge detection — the image may be blocked by cross-origin security."
      );
    } finally {
      setIsApplying(false);
    }
  };

  const resetSobel = async () => {
    const img = getActiveImage(canvasEditor);
    const pristine = img?.originalSrc || originalSrcRef.current;
    if (!img || !pristine || isApplying) return;

    setIsApplying(true);
    try {
      await revertToOriginal(canvasEditor, img, pristine);
      originalSrcRef.current = null;
      magRef.current = null;
      setHasCache(false);
      setApplied(false);
      setThreshold(0);
      setInvert(false);
      toast.success("Reverted to original");
    } catch (error) {
      console.error("Error resetting edge detection:", error);
      toast.error("Couldn't revert the image — please try again.");
    } finally {
      setIsApplying(false);
    }
  };

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Load an image to detect edges</p>
      </div>
    );
  }

  const activeImage = getActiveImage(canvasEditor);
  if (!activeImage) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Select an image to detect edges</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Reset */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-white">Edge Detection</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetSobel}
          disabled={!applied || isApplying}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <p className="text-xs text-white/60 leading-relaxed">
        Outlines the image using the{" "}
        <span className="text-white/80 font-medium">Sobel operator</span> — it
        convolves two gradient kernels and shows where brightness changes
        sharply. Bright pixels are strong edges.
      </p>

      {/* Edge threshold */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-white">Edge threshold</label>
          <span className="text-xs text-white/70">
            {threshold === 0 ? "raw" : threshold}
          </span>
        </div>
        <Slider
          value={[threshold]}
          onValueChange={(value) => setThreshold(value[0])}
          onValueCommit={(value) => renderFromCache(value[0], invert)}
          min={0}
          max={255}
          step={1}
          className="w-full"
          disabled={!hasCache || isApplying}
        />
        <p className="text-[11px] text-white/40">
          0 keeps the raw gradient; higher values keep only strong edges.
        </p>
      </div>

      {/* Invert */}
      <div className="flex justify-between items-center">
        <label className="text-sm text-white">Invert (dark edges on white)</label>
        <Switch
          checked={invert}
          onCheckedChange={(checked) => {
            setInvert(checked);
            if (hasCache) renderFromCache(threshold, checked);
          }}
          disabled={isApplying}
        />
      </div>

      {/* Apply */}
      <Button onClick={applySobel} disabled={isApplying} className="w-full gap-2">
        {isApplying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Detecting...
          </>
        ) : (
          <>
            <Grid3x3 className="h-4 w-4" />
            {applied ? "Re-apply Edge Detection" : "Detect Edges"}
          </>
        )}
      </Button>

      {/* Info */}
      <div className="mt-2 p-3 bg-slate-700/50 rounded-lg">
        <p className="text-xs text-white/70">
          O(N) convolution with the 3×3 Sobel kernels (Gx, Gy); each pixel
          becomes √(Gx² + Gy²). The edge map is cached, so changing the
          threshold or inverting re-maps it without re-convolving. The result
          is uploaded so the saved project stays small.
        </p>
      </div>
    </div>
  );
}
