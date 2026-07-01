"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RotateCcw, Loader2, Sparkles, Upload } from "lucide-react";
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
 *  REINHARD'S COLOR TRANSFER (my own algorithm)
 * =====================================================================
 *  Transfers the color palette and mood from a reference image to the
 *  active canvas image using decorrelated L*a*b* color space matching.
 *  It aligns the mean and standard deviation of each color channel.
 *
 *  Complexity: O(N_src + N_ref) for conversions and statistics.
 *  Uses CORS-compliant Unsplash images for presets and FileReader for
 *  custom image uploads.
 * =====================================================================
 */

const PRESETS = [
  {
    name: "Golden Hour",
    description: "Warm tropical sunset tones",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&q=80",
  },
  {
    name: "Deep Forest",
    description: "Cool green moss and teal foliage",
    url: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=200&q=80",
  },
  {
    name: "Neon Night",
    description: "Cyberpunk purple and cyan tones",
    url: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=200&q=80",
  },
  {
    name: "Analog Vintage",
    description: "Faded sepia and warm film stock",
    url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&q=80",
  },
];

// RGB -> LMS
function rgbToLms(r, g, b) {
  let L = 0.3811 * r + 0.5783 * g + 0.0402 * b;
  let M = 0.1967 * r + 0.7244 * g + 0.0782 * b;
  let S = 0.0241 * r + 0.1288 * g + 0.8444 * b;
  
  // Prevent log10(0)
  L = L < 1e-5 ? 1e-5 : L;
  M = M < 1e-5 ? 1e-5 : M;
  S = S < 1e-5 ? 1e-5 : S;
  return [L, M, S];
}

// LMS -> Lab (decorrelated color space)
function lmsToLab(L, M, S) {
  const logL = Math.log10(L);
  const logM = Math.log10(M);
  const logS = Math.log10(S);

  const l = (logL + logM + logS) / Math.sqrt(3);
  const alpha = (logL + logM - 2 * logS) / Math.sqrt(6);
  const beta = (logL - logM) / Math.sqrt(2);
  return [l, alpha, beta];
}

// Lab -> LMS
function labToLms(l, alpha, beta) {
  const logL = (Math.sqrt(3) / 3) * l + (Math.sqrt(6) / 6) * alpha + (Math.sqrt(2) / 2) * beta;
  const logM = (Math.sqrt(3) / 3) * l + (Math.sqrt(6) / 6) * alpha - (Math.sqrt(2) / 2) * beta;
  const logS = (Math.sqrt(3) / 3) * l - (Math.sqrt(6) / 3) * alpha;

  let L = Math.pow(10, logL);
  let M = Math.pow(10, logM);
  let S = Math.pow(10, logS);
  return [L, M, S];
}

// LMS -> RGB
function lmsToRgb(L, M, S) {
  const r = 4.4679 * L - 3.5873 * M + 0.1193 * S;
  const g = -1.2186 * L + 2.3809 * M - 0.1624 * S;
  const b = 0.0497 * L - 0.2439 * M + 1.2045 * S;
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

// Extract mean and std dev statistics for L, A, B channels
function getLabStats(labArray) {
  const n = labArray.length;
  let sumL = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    sumL += labArray[i][0];
    sumA += labArray[i][1];
    sumB += labArray[i][2];
  }
  const meanL = sumL / n;
  const meanA = sumA / n;
  const meanB = sumB / n;

  let varL = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dL = labArray[i][0] - meanL;
    const dA = labArray[i][1] - meanA;
    const dB = labArray[i][2] - meanB;
    varL += dL * dL;
    varA += dA * dA;
    varB += dB * dB;
  }
  const stdL = Math.sqrt(varL / n) || 1e-5;
  const stdA = Math.sqrt(varA / n) || 1e-5;
  const stdB = Math.sqrt(varB / n) || 1e-5;

  return {
    mean: [meanL, meanA, meanB],
    std: [stdL, stdA, stdB],
  };
}

// Core Reinhard Color Transfer algorithm
export function runColorTransfer(srcData, refData, strength = 1.0) {
  const src = srcData.data;
  const ref = refData.data;

  // 1. Convert Source to Lab
  const srcLab = [];
  for (let i = 0; i < src.length; i += 4) {
    const lms = rgbToLms(src[i], src[i + 1], src[i + 2]);
    srcLab.push(lmsToLab(lms[0], lms[1], lms[2]));
  }

  // 2. Convert Reference to Lab
  const refLab = [];
  for (let i = 0; i < ref.length; i += 4) {
    const lms = rgbToLms(ref[i], ref[i + 1], ref[i + 2]);
    refLab.push(lmsToLab(lms[0], lms[1], lms[2]));
  }

  // 3. Extract Channel Stats
  const srcStats = getLabStats(srcLab);
  const refStats = getLabStats(refLab);

  // 4. Perform Channel Alignment
  const outData = new Uint8ClampedArray(src.length);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    const l = srcLab[p][0];
    const alpha = srcLab[p][1];
    const beta = srcLab[p][2];

    // Alignment equations
    let lNew = (l - srcStats.mean[0]) * (refStats.std[0] / srcStats.std[0]) + refStats.mean[0];
    let aNew = (alpha - srcStats.mean[1]) * (refStats.std[1] / srcStats.std[1]) + refStats.mean[1];
    let bNew = (beta - srcStats.mean[2]) * (refStats.std[2] / srcStats.std[2]) + refStats.mean[2];

    // Blending via strength
    lNew = l + (lNew - l) * strength;
    aNew = alpha + (aNew - alpha) * strength;
    bNew = beta + (bNew - beta) * strength;

    // Convert back to LMS and RGB
    const lms = labToLms(lNew, aNew, bNew);
    const rgb = lmsToRgb(lms[0], lms[1], lms[2]);

    outData[i] = rgb[0];
    outData[i + 1] = rgb[1];
    outData[i + 2] = rgb[2];
    outData[i + 3] = src[i + 3]; // Preserve alpha
  }

  // Write back to canvas-safe output ImageData
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const outputImgData = ctx.createImageData(srcData.width, srcData.height);
  outputImgData.data.set(outData);
  return outputImgData;
}

export function ColorTransferControls() {
  const { canvasEditor } = useCanvas();
  const [strength, setStrength] = useState(80); // strength percentage (0..100)
  const [selectedPreset, setSelectedPreset] = useState(0); // active preset index
  const [customImageSrc, setCustomImageSrc] = useState(null); // base64 source for custom reference image
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const originalSrcRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const img = getActiveImage(canvasEditor);
    if (img?.originalSrc) {
      originalSrcRef.current = img.originalSrc;
      setApplied(true);
    }
  }, [canvasEditor]);

  const handleCustomUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCustomImageSrc(event.target.result);
        setSelectedPreset(-1); // Deselect presets
        toast.success("Custom reference mood image loaded!");
      }
    };
    reader.readAsDataURL(file);
  };

  const applyColorTransfer = async () => {
    const img = getActiveImage(canvasEditor);
    if (!img || isApplying) return;

    setIsApplying(true);
    try {
      const pristine = img.originalSrc || originalSrcRef.current || img.getSrc();
      originalSrcRef.current = pristine;

      // 1. Read source image pixels
      const srcResult = await readSourceImageData(pristine);

      // 2. Read reference image pixels (preset URL or custom uploader)
      const refSrc = selectedPreset === -1 ? customImageSrc : PRESETS[selectedPreset].url;
      if (!refSrc) {
        toast.error("Please select a preset or upload a custom image first.");
        setIsApplying(false);
        return;
      }
      const refResult = await readSourceImageData(refSrc);

      // 3. Run Reinhard's color transfer
      const outputImgData = runColorTransfer(srcResult.imageData, refResult.imageData, strength / 100);

      // 4. Build PNG URL and apply to active Canvas object
      const dataURL = imageDataToDataURL(outputImgData);
      await applyDataURL(canvasEditor, img, dataURL, pristine, `mood-${Date.now()}.png`);

      setApplied(true);
      toast.success("Mood palette matched successfully!");
    } catch (error) {
      console.error("Error applying Reinhard color transfer:", error);
      toast.error("Couldn't process color transfer. Verify CORS or upload a clean reference.");
    } finally {
      setIsApplying(false);
    }
  };

  const resetColorTransfer = async () => {
    const img = getActiveImage(canvasEditor);
    const pristine = img?.originalSrc || originalSrcRef.current;
    if (!img || !pristine || isApplying) return;

    setIsApplying(true);
    try {
      await revertToOriginal(canvasEditor, img, pristine);
      originalSrcRef.current = null;
      setApplied(false);
      setStrength(80);
      setSelectedPreset(0);
      setCustomImageSrc(null);
      toast.success("Reverted image mood to original");
    } catch (error) {
      console.error("Error resetting color transfer:", error);
      toast.error("Reversion failed.");
    } finally {
      setIsApplying(false);
    }
  };

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Load an image to perform color transfer</p>
      </div>
    );
  }

  const activeImage = getActiveImage(canvasEditor);
  if (!activeImage) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Select an image to transfer color to</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-white">Mood Color Matcher</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetColorTransfer}
          disabled={!applied || isApplying}
          className="text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>

      <p className="text-xs text-white/60 leading-relaxed font-light">
        Uses **Reinhard's algorithm** to transfer the color theme and lighting mood
        from any reference photo to your canvas layer. It aligns statistical color moments
        in the decorrelated $l\alpha\beta$ color space.
      </p>

      {/* Preset List */}
      <div className="space-y-3">
        <label className="text-sm text-white">Choose Mood Preset</label>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset, index) => (
            <div
              key={index}
              onClick={() => {
                setSelectedPreset(index);
                setCustomImageSrc(null);
              }}
              className={`cursor-pointer rounded-lg border overflow-hidden p-1 transition-all ${
                selectedPreset === index
                  ? "border-sky-500 bg-sky-950/20"
                  : "border-white/5 hover:border-white/20 bg-slate-800/40"
              }`}
            >
              {/* Preset Thumbnail */}
              <div
                className="h-16 w-full rounded-md bg-cover bg-center"
                style={{ backgroundImage: `url(${preset.url})` }}
              />
              <div className="p-1 mt-1 text-left">
                <p className="text-[10px] font-semibold text-white">{preset.name}</p>
                <p className="text-[8px] text-white/40 leading-none truncate">{preset.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Reference Image Upload */}
      <div className="space-y-2">
        <label className="text-sm text-white">Or Upload Custom Reference</label>
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleCustomUpload}
          className="hidden"
          disabled={isApplying}
        />
        {customImageSrc ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="h-20 w-full rounded-lg border border-sky-500 bg-sky-950/20 flex items-center justify-center cursor-pointer overflow-hidden p-1 group"
          >
            <div
              className="h-full w-full rounded-md bg-cover bg-center flex items-center justify-center"
              style={{ backgroundImage: `url(${customImageSrc})` }}
            >
              <span className="text-[10px] text-white/90 bg-black/60 px-2 py-1 rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                Change Image
              </span>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full border-dashed border-white/10 hover:border-white/30 text-white/60 bg-transparent flex gap-2 h-12"
            onClick={() => fileInputRef.current?.click()}
            disabled={isApplying}
          >
            <Upload className="h-4 w-4" />
            Upload reference image
          </Button>
        )}
      </div>

      {/* Strength selection */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-sm text-white">Match Strength</label>
          <span className="text-xs text-white/70 font-semibold">{strength}%</span>
        </div>
        <Slider
          value={[strength]}
          onValueChange={(val) => setStrength(val[0])}
          min={0}
          max={100}
          step={1}
          className="w-full"
          disabled={isApplying}
        />
        <p className="text-[10px] text-white/40">
          Lower values maintain original tones; 100% applies full color shifting.
        </p>
      </div>

      {/* Match action button */}
      <Button onClick={applyColorTransfer} disabled={isApplying} className="w-full gap-2 mt-4 bg-sky-600 hover:bg-sky-500 text-white">
        {isApplying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Transferring Mood...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {applied ? "Re-apply Color Match" : "Match Mood Color"}
          </>
        )}
      </Button>

      {/* Reinhard's Math Explanatory Card */}
      <div className="p-3 bg-slate-900/40 rounded-lg border border-white/5 text-[11px] text-white/50 space-y-1.5 leading-relaxed">
        <p className="font-semibold text-white/70">How It Works (Reinhard 2001):</p>
        <p>1. Convert RGB pixels to LMS cone space, then log-scale each channel.</p>
        <p>2. Decorrelate via lab color space to make channels independent.</p>
        <p>3. Shift each channel mean and scale by std-dev ratio: S&apos; = (S - mean_src) * (std_ref / std_src) + mean_ref.</p>
        <p>4. Reconstruct: invert lab to log-LMS to LMS to RGB.</p>
      </div>
    </div>
  );
}
