"use client";

import React, { useState, useEffect, useRef } from "react";
import { useCanvas } from "@/context/context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Sliders,
  Sparkles,
  Wand2,
  SlidersHorizontal,
  Home,
  Crop,
  Expand,
  Type,
  Droplet,
  Palette,
  Eye,
  Maximize2,
  Grid3x3,
  Contrast,
  ChevronLeft,
} from "lucide-react";

// Tool control panels
import { AdjustControls } from "./_tools/adjust";
import { AutoEnhanceControls } from "./_tools/auto-enhance";
import { SobelControls } from "./_tools/sobel-edge";
import { OtsuControls } from "./_tools/otsu-threshold";
import { BackgroundControls } from "./_tools/background-controls";
import { TextControls } from "./_tools/text";
import { AIExtenderControls } from "./_tools/ai-extend";
import { ResizeControls } from "./_tools/resize";
import { CropContent } from "./_tools/crop";
import { KMeansControls } from "./_tools/kmeans-segmentation";
import { BlurControls } from "./_tools/blur";
import { getActiveImage } from "./_tools/pixel-utils";

/**
 * Real-time image luminance Histogram
 */
export function Histogram() {
  const { canvasEditor } = useCanvas();
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!canvasEditor) return;

    const updateHistogram = () => {
      const imgObj = getActiveImage(canvasEditor);
      if (!imgObj) {
        setData(null);
        return;
      }

      try {
        const imgEl = imgObj._element;
        if (!imgEl) return;

        // Downsample to compute quickly
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgEl, 0, 0, 128, 128);
        const imgData = ctx.getImageData(0, 0, 128, 128).data;

        const hist = new Array(256).fill(0);
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          // Rec.601 luma weights
          const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          hist[y]++;
        }
        setData(hist);
      } catch (err) {
        console.warn("Histogram failed to compute (CORS/Ready):", err);
      }
    };

    // Run initial
    updateHistogram();

    // Listen to canvas events
    canvasEditor.on("object:modified", updateHistogram);
    canvasEditor.on("after:render", updateHistogram);

    return () => {
      canvasEditor.off("object:modified", updateHistogram);
      canvasEditor.off("after:render", updateHistogram);
    };
  }, [canvasEditor]);

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    const ctx = canvasRef.current.getContext("2d");
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    ctx.clearRect(0, 0, width, height);

    const maxVal = Math.max(...data, 1);
    const barWidth = width / 256;

    // Drawing transparent slate gray bars
    ctx.fillStyle = "#475569";
    for (let i = 0; i < 256; i++) {
      const h = (data[i] / maxVal) * height * 0.9;
      ctx.fillRect(i * barWidth, height - h, barWidth, h);
    }
  }, [data]);

  if (!data) {
    return (
      <div className="h-32 rounded-xl bg-slate-900/40 border border-white/5 flex items-center justify-center text-xs text-white/30">
        No active image source for histogram
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-4 border-t border-white/5">
      <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Histogram</div>
      <div className="h-28 rounded-xl bg-slate-950/80 border border-white/5 p-2 flex items-end">
        <canvas ref={canvasRef} width={280} height={90} className="w-full h-full opacity-60" />
      </div>
    </div>
  );
}

export function EditorInspector({ project }) {
  const { activeTool, onToolChange } = useCanvas();
  const [activeTab, setActiveTab] = useState("adjust");

  // If a specific workspace tool is active, display its configuration controls
  const isToolActive = activeTool && activeTool !== "select" && activeTool !== "move";

  const getToolTitle = () => {
    switch (activeTool) {
      case "crop": return "Crop Image";
      case "resize": return "Resize Canvas";
      case "text": return "Typography / Text";
      case "blur": return "Defocus / Blur Filters";
      case "background": return "AI Remove Background";
      case "ai_extender": return "AI Canvas Extender";
      case "kmeans": return "K-Means Quantization";
      case "threshold": return "Otsu Binarization";
      case "edge_detection": return "Sobel Edge Highlights";
      case "auto_enhance": return "Auto Enhancer";
      default: return "Active Tool";
    }
  };

  const renderInspectorContent = () => {
    switch (activeTool) {
      case "crop":
        return <CropContent />;
      case "resize":
        return <ResizeControls project={project} />;
      case "text":
        return <TextControls />;
      case "blur":
        return <BlurControls />;
      case "background":
        return <BackgroundControls project={project} />;
      case "ai_extender":
        return <AIExtenderControls project={project} />;
      case "kmeans":
        return <KMeansControls />;
      case "threshold":
        return <OtsuControls />;
      case "edge_detection":
        return <SobelControls />;
      case "auto_enhance":
        return <AutoEnhanceControls />;
      default:
        return null;
    }
  };

  return (
    <div className="w-96 bg-sidebar border-l border-white/5 flex flex-col shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="p-5 border-b border-white/5 flex flex-col gap-1.5 shrink-0">
        {isToolActive ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white rounded-lg bg-white/5 hover:bg-white/10"
              onClick={() => onToolChange("select")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">{getToolTitle()}</h2>
              <p className="text-xs text-white/40">Adjust parameters below</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/5 rounded-lg">
              <Home className="h-4 w-4 text-white/80" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">Inspector</h2>
              <p className="text-xs text-white/40">Configure active workspace elements</p>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-5 space-y-6">
        {isToolActive ? (
          <div className="space-y-4">{renderInspectorContent()}</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-5">
            {/* Custom styled tabs list matching the screenshot */}
            <TabsList className="grid grid-cols-3 bg-slate-950 p-1 rounded-xl border border-white/5">
              <TabsTrigger
                value="adjust"
                className="text-xs py-2 rounded-lg data-[state=active]:bg-[#2C2C2C] data-[state=active]:text-white data-[state=active]:shadow-none transition-all cursor-pointer"
              >
                Adjust
              </TabsTrigger>
              <TabsTrigger
                value="effects"
                className="text-xs py-2 rounded-lg data-[state=active]:bg-[#2C2C2C] data-[state=active]:text-white data-[state=active]:shadow-none transition-all cursor-pointer"
              >
                Effects
              </TabsTrigger>
              <TabsTrigger
                value="ai"
                className="text-xs py-2 rounded-lg data-[state=active]:bg-[#2C2C2C] data-[state=active]:text-white data-[state=active]:shadow-none transition-all cursor-pointer"
              >
                AI Tools
              </TabsTrigger>
            </TabsList>

            {/* Adjust Tab Content */}
            <TabsContent value="adjust" className="space-y-5 outline-none">
              <AdjustControls />
              <Histogram />
            </TabsContent>

            {/* Effects Tab Content */}
            <TabsContent value="effects" className="space-y-4 outline-none">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Mathematical Operators</label>
                <div className="grid grid-cols-1 gap-2.5">
                  <Button
                    variant="outline"
                    onClick={() => onToolChange("kmeans")}
                    className="w-full justify-start text-left bg-slate-900 hover:bg-slate-800 border-white/5 h-12 text-sm text-white px-4 hover:border-white/10"
                  >
                    <Grid3x3 className="h-4 w-4 mr-3 text-cyan-400" />
                    K-Means Clustering
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onToolChange("threshold")}
                    className="w-full justify-start text-left bg-slate-900 hover:bg-slate-800 border-white/5 h-12 text-sm text-white px-4 hover:border-white/10"
                  >
                    <Contrast className="h-4 w-4 mr-3 text-orange-400" />
                    Otsu Threshold
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onToolChange("edge_detection")}
                    className="w-full justify-start text-left bg-slate-900 hover:bg-slate-800 border-white/5 h-12 text-sm text-white px-4 hover:border-white/10"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-3 text-green-400" />
                    Sobel Edge Operator
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onToolChange("blur")}
                    className="w-full justify-start text-left bg-slate-900 hover:bg-slate-800 border-white/5 h-12 text-sm text-white px-4 hover:border-white/10"
                  >
                    <Droplet className="h-4 w-4 mr-3 text-blue-400" />
                    Separable Gaussian & DoF Blur
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onToolChange("auto_enhance")}
                    className="w-full justify-start text-left bg-slate-900 hover:bg-slate-800 border-white/5 h-12 text-sm text-white px-4 hover:border-white/10"
                  >
                    <Wand2 className="h-4 w-4 mr-3 text-yellow-400" />
                    Histogram Equalization (Enhance)
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* AI Tools Tab Content */}
            <TabsContent value="ai" className="space-y-4 outline-none">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider font-mono">Neural Models</label>
                <div className="grid grid-cols-1 gap-2.5">
                  <Button
                    variant="outline"
                    onClick={() => onToolChange("background")}
                    className="w-full justify-start text-left bg-slate-900 hover:bg-slate-800 border-white/5 h-12 text-sm text-white px-4 hover:border-white/10"
                  >
                    <Palette className="h-4 w-4 mr-3 text-purple-400" />
                    AI Background Removal
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onToolChange("ai_extender")}
                    className="w-full justify-start text-left bg-slate-900 hover:bg-slate-800 border-white/5 h-12 text-sm text-white px-4 hover:border-white/10"
                  >
                    <Maximize2 className="h-4 w-4 mr-3 text-pink-400" />
                    AI Image Extender
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
