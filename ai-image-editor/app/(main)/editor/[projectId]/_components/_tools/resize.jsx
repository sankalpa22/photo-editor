"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Expand, 
  Lock, 
  Unlock, 
  Monitor, 
  Scaling, 
  Layers,
  ArrowRightLeft,
  ArrowUpDown
} from "lucide-react";
import { useCanvas } from "@/context/context";
import { useConvexMutation } from "@/hooks/use-convex-query";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Common aspect ratios
const ASPECT_RATIOS = [
  { name: "Instagram Story", ratio: [9, 16], label: "9:16", icon: "📱" },
  { name: "Instagram Post", ratio: [1, 1], label: "1:1", icon: "📸" },
  { name: "Youtube Thumbnail", ratio: [16, 9], label: "16:9", icon: "📺" },
  { name: "Portrait", ratio: [2, 3], label: "2:3", icon: "👤" },
  { name: "Facebook Cover", ratio: [851, 315], label: "2.7:1", icon: "👥" },
  { name: "Standard A4", ratio: [210, 297], label: "1:1.41", icon: "📄" },
];

export function ResizeControls({ project }) {
  const { canvasEditor, setProcessingMessage } = useCanvas();
  const [newWidth, setNewWidth] = useState(project?.width || 800);
  const [newHeight, setNewHeight] = useState(project?.height || 600);
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [scaleContent, setScaleContent] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState(null);

  const { mutate: updateProject, isLoading } = useConvexMutation(api.projects.updateProject);

  // Sync internal state with project updates (e.g. from auto-expand)
  useEffect(() => {
    if (project) {
      setNewWidth(project.width);
      setNewHeight(project.height);
    }
  }, [project?.width, project?.height]);

  // Calculate dimensions for aspect ratio maintaining current area
  const calculateAspectRatioDimensions = (ratio) => {
    if (!project) return { width: 800, height: 600 };
    const [ratioW, ratioH] = ratio;
    const currentArea = project.width * project.height;
    const aspectRatio = ratioW / ratioH;
    const height = Math.sqrt(currentArea / aspectRatio);
    const width = height * aspectRatio;
    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  };

  const handleWidthChange = (value) => {
    const width = Math.max(10, parseInt(value) || 0);
    setNewWidth(width);
    if (lockAspectRatio && project) {
      const ratio = project.height / project.width;
      setNewHeight(Math.round(width * ratio));
    }
    setSelectedPreset(null);
  };

  const handleHeightChange = (value) => {
    const height = Math.max(10, parseInt(value) || 0);
    setNewHeight(height);
    if (lockAspectRatio && project) {
      const ratio = project.width / project.height;
      setNewWidth(Math.round(height * ratio));
    }
    setSelectedPreset(null);
  };

  const applyAspectRatio = (aspectRatio) => {
    const dimensions = calculateAspectRatioDimensions(aspectRatio.ratio);
    setNewWidth(dimensions.width);
    setNewHeight(dimensions.height);
    setSelectedPreset(aspectRatio.name);
  };

  const handleApplyResize = async () => {
    if (!canvasEditor || !project) return;
    
    const isSameSize = newWidth === project.width && newHeight === project.height;
    if (isSameSize) return;

    setProcessingMessage("Resizing workspace...");

    try {
      let finalCanvasState = canvasEditor.toJSON();

      // Implement Content Scaling if requested
      if (scaleContent) {
        const scaleX = newWidth / project.width;
        const scaleY = newHeight / project.height;
        
        const objects = canvasEditor.getObjects();
        objects.forEach((obj) => {
          // Store original properties for restoration if needed
          const originalLeft = obj.left;
          const originalTop = obj.top;
          const originalScaleX = obj.scaleX;
          const originalScaleY = obj.scaleY;

          obj.set({
            left: originalLeft * scaleX,
            top: originalTop * scaleY,
            scaleX: originalScaleX * scaleX,
            scaleY: originalScaleY * scaleY
          });
          obj.setCoords();
        });
        
        finalCanvasState = canvasEditor.toJSON();
        canvasEditor.requestRenderAll();
      }

      // Update project in database - Reactive query in page.jsx will handle re-render
      await updateProject({
        projectId: project._id,
        width: newWidth,
        height: newHeight,
        canvasState: finalCanvasState,
      });

    } catch (error) {
      console.error("Resize Error:", error);
    } finally {
      setProcessingMessage(null);
    }
  };

  if (!canvasEditor || !project) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
          <Monitor className="text-white/20 animate-pulse" />
        </div>
        <p className="text-white/40 text-sm font-light">Intializing workspace...</p>
      </div>
    );
  }

  const hasChanges = newWidth !== project.width || newHeight !== project.height;

  return (
    <div className="flex flex-col h-full bg-[#0f172a] text-slate-200">
      <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white tracking-tight">Dimensions</h3>
            <p className="text-xs text-slate-400">Configure your workspace size</p>
          </div>
          <Layers className="h-5 w-5 text-cyan-400 opacity-50" />
        </div>

        {/* Current Info Card */}
        <div className="bg-slate-800/40 border border-white/5 rounded-xl p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Current Canvas</span>
            <p className="text-xl font-mono text-cyan-50 font-medium">
              {project.width} <span className="text-slate-600">×</span> {project.height}
            </p>
          </div>
          <div className="bg-cyan-500/10 p-2 rounded-lg">
            <Expand className="h-5 w-5 text-cyan-400" />
          </div>
        </div>

        {/* Manual Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-300">Custom Adjustment</h4>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLockAspectRatio(!lockAspectRatio)}
              className={`h-8 w-8 rounded-full transition-all ${
                lockAspectRatio ? "bg-cyan-500/20 text-cyan-400" : "hover:bg-slate-800 text-slate-500"
              }`}
            >
              {lockAspectRatio ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            </Button>
          </div>

          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-slate-500 ml-1">Width (px)</Label>
              <Input
                type="number"
                value={newWidth}
                onChange={(e) => handleWidthChange(e.target.value)}
                className="bg-slate-900 border-white/10 h-10 text-white font-mono focus:ring-cyan-500/20 transition-all rounded-lg"
              />
            </div>
            <ArrowRightLeft className="h-4 w-4 text-slate-700 mt-5" />
            <div className="space-y-1.5">
              <Label className="text-[10px] text-slate-500 ml-1">Height (px)</Label>
              <Input
                type="number"
                value={newHeight}
                onChange={(e) => handleHeightChange(e.target.value)}
                className="bg-slate-900 border-white/10 h-10 text-white font-mono focus:ring-cyan-500/20 transition-all rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Scaling Toggle */}
        <div className="bg-slate-800/20 border border-white/5 rounded-xl p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors group cursor-pointer" onClick={() => setScaleContent(!scaleContent)}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-colors ${scaleContent ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-700 text-slate-500"}`}>
              <Scaling className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Scale Content</p>
              <p className="text-[10px] text-slate-500">Proportionally resize all objects</p>
            </div>
          </div>
          <Switch 
            checked={scaleContent} 
            onCheckedChange={(val) => setScaleContent(!!val)}
            className="data-[state=checked]:bg-cyan-500" 
          />
        </div>


        {/* Presets Grid */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-300">Popular Formats</h4>
          <div className="grid grid-cols-1 gap-2">
            {ASPECT_RATIOS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyAspectRatio(preset)}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left group ${
                  selectedPreset === preset.name 
                  ? "bg-cyan-500/10 border-cyan-500/50 text-white" 
                  : "bg-slate-800/30 border-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg opacity-80 group-hover:scale-110 transition-transform">{preset.icon}</span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide">{preset.name}</p>
                    <p className="text-[10px] opacity-60 font-mono">{preset.label}</p>
                  </div>
                </div>
                {selectedPreset === preset.name && (
                  <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Apply Section */}
      <div className="mt-auto p-4 border-t border-white/5 bg-slate-900/50 backdrop-blur-sm">
        <Button
          onClick={handleApplyResize}
          disabled={!hasChanges || isLoading}
          className={`w-full h-12 text-sm font-bold uppercase tracking-widest transition-all rounded-xl ${
            hasChanges 
            ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] text-white border-0" 
            : "bg-slate-800 text-slate-500 border-white/5"
          }`}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Applying...
            </div>
          ) : (
            <>
              <Expand className="h-4 w-4 mr-2" />
              Update Canvas
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
