"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Contrast, RotateCcw, Loader2 } from "lucide-react";
import { useCanvas } from "@/context/context";
import {
  getActiveImage,
  readSourceImageData,
  toLuminance,
  computeHistogram,
  scalarToDataURL,
  applyDataURL,
  revertToOriginal,
} from "./pixel-utils";

/**
 * =====================================================================
 *  THRESHOLD  —  OTSU'S METHOD (my own algorithm)
 * =====================================================================
 *  Turns the image into pure black & white by automatically choosing the
 *  best brightness cut-off. It scans all 256 candidate thresholds and
 *  picks the one that maximises the BETWEEN-CLASS variance — which is
 *  mathematically the same as minimising the spread inside each class, so
 *  the two groups (dark / light) end up as cleanly separated as possible.
 *
 *    sigma_b^2(t) = w0(t) * w1(t) * (mu0(t) - mu1(t))^2
 *
 *  It reuses the same luminance histogram the auto-enhance tool builds.
 *  Complexity: O(N + 256).
 * =====================================================================
 */

/**
 * Otsu's automatic threshold.
 *
 * @param {number[]} histogram   256-bin luminance histogram
 * @param {number}   totalPixels N — total number of pixels
 * @returns {number} the optimal threshold t in 0..255 (pixels > t are "light")
 */
export function otsuThreshold(histogram, totalPixels) {
  // Total intensity sum, used to derive the "light" class mean cheaply.
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * histogram[t];

  let sumBelow = 0; // weighted sum of the "dark" class
  let weightBelow = 0; // pixel count of the "dark" class
  let maxBetween = -1;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    weightBelow += histogram[t];
    if (weightBelow === 0) continue; // no dark pixels yet

    const weightAbove = totalPixels - weightBelow;
    if (weightAbove === 0) break; // everything is dark — done

    sumBelow += t * histogram[t];
    const meanBelow = sumBelow / weightBelow;
    const meanAbove = (sumAll - sumBelow) / weightAbove;

    const diff = meanBelow - meanAbove;
    const between = weightBelow * weightAbove * diff * diff;

    if (between > maxBetween) {
      maxBetween = between;
      threshold = t;
    }
  }

  return threshold;
}

export function OtsuControls() {
  const { canvasEditor } = useCanvas();
  const [threshold, setThreshold] = useState(128);
  const [autoT, setAutoT] = useState(null); // the value Otsu chose
  const [invert, setInvert] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [hasCache, setHasCache] = useState(false);

  const originalSrcRef = useRef(null);
  const lumaRef = useRef(null); // { data, width, height } — cached luminance
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

  // Binarize: pixels brighter than the threshold are "foreground" (white).
  const binaryMap = (thr, inv) => (v) => {
    const foreground = v > thr;
    return (inv ? !foreground : foreground) ? 255 : 0;
  };

  // Re-binarize from cached luminance — no decode or histogram pass; the
  // result is uploaded so the saved project stays small.
  const renderFromCache = async (thr, inv) => {
    const cache = lumaRef.current;
    const img = getActiveImage(canvasEditor);
    if (!cache || !img || renderLock.current) return;
    renderLock.current = true;
    setIsApplying(true);
    try {
      const dataURL = scalarToDataURL(
        cache.data,
        cache.width,
        cache.height,
        binaryMap(thr, inv)
      );
      await applyDataURL(
        canvasEditor,
        img,
        dataURL,
        originalSrcRef.current,
        `threshold-${Date.now()}.png`
      );
    } catch (error) {
      console.error("Error rendering threshold:", error);
      toast.error("Couldn't save the change — please try again.");
    } finally {
      renderLock.current = false;
      setIsApplying(false);
    }
  };

  const applyOtsu = async () => {
    const img = getActiveImage(canvasEditor);
    if (!img || isApplying) return;

    setIsApplying(true);
    try {
      const pristine =
        img.originalSrc || originalSrcRef.current || img.getSrc();
      originalSrcRef.current = pristine;

      const { imageData, width, height } = await readSourceImageData(pristine);
      const luma = toLuminance(imageData.data);
      lumaRef.current = { data: luma, width, height };
      setHasCache(true);

      // ---- the algorithm ----
      const histogram = computeHistogram(luma);
      const t = otsuThreshold(histogram, luma.length);
      setThreshold(t);
      setAutoT(t);

      const dataURL = scalarToDataURL(
        luma,
        width,
        height,
        binaryMap(t, invert)
      );
      await applyDataURL(canvasEditor, img, dataURL, pristine, `threshold-${Date.now()}.png`);

      setApplied(true);
      toast.success(`Otsu threshold applied (t = ${t})`);
    } catch (error) {
      console.error("Error applying threshold:", error);
      toast.error(
        "Couldn't threshold the image — it may be blocked by cross-origin security."
      );
    } finally {
      setIsApplying(false);
    }
  };

  const resetOtsu = async () => {
    const img = getActiveImage(canvasEditor);
    const pristine = img?.originalSrc || originalSrcRef.current;
    if (!img || !pristine || isApplying) return;

    setIsApplying(true);
    try {
      await revertToOriginal(canvasEditor, img, pristine);
      originalSrcRef.current = null;
      lumaRef.current = null;
      setHasCache(false);
      setApplied(false);
      setAutoT(null);
      setThreshold(128);
      setInvert(false);
      toast.success("Reverted to original");
    } catch (error) {
      console.error("Error resetting threshold:", error);
      toast.error("Couldn't revert the image — please try again.");
    } finally {
      setIsApplying(false);
    }
  };

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Load an image to threshold</p>
      </div>
    );
  }

  const activeImage = getActiveImage(canvasEditor);
  if (!activeImage) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Select an image to threshold</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Reset */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-white">Threshold (Otsu)</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetOtsu}
          disabled={!applied || isApplying}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <p className="text-xs text-white/60 leading-relaxed">
        Converts the image to black &amp; white using{" "}
        <span className="text-white/80 font-medium">Otsu's method</span> — it
        reads the brightness histogram and automatically picks the cut-off that
        best separates dark from light.
      </p>

      {/* Threshold (auto-filled by Otsu, fine-tune by hand) */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-white">Threshold</label>
          <span className="text-xs text-white/70">{threshold}</span>
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
          {autoT !== null
            ? `Otsu auto-selected ${autoT}. Drag to fine-tune.`
            : "Apply to let Otsu choose the threshold automatically."}
        </p>
      </div>

      {/* Invert */}
      <div className="flex justify-between items-center">
        <label className="text-sm text-white">Invert (swap black / white)</label>
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
      <Button onClick={applyOtsu} disabled={isApplying} className="w-full gap-2">
        {isApplying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Thresholding...
          </>
        ) : (
          <>
            <Contrast className="h-4 w-4" />
            {applied ? "Re-run Otsu" : "Apply Otsu Threshold"}
          </>
        )}
      </Button>

      {/* Info */}
      <div className="mt-2 p-3 bg-slate-700/50 rounded-lg">
        <p className="text-xs text-white/70">
          O(N + 256): build the luminance histogram, then sweep all 256
          thresholds to maximise the between-class variance. The luminance is
          cached, so dragging the slider re-binarizes without re-reading the
          image. The result is uploaded so the saved project stays small.
        </p>
      </div>
    </div>
  );
}
