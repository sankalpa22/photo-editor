"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trash2,
  Palette,
  Image as ImageIcon,
  Search,
  Download,
  Loader2,
  Check,
  Info,
  Wand2,
  Sparkles,
  LayoutDashboard
} from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { useCanvas } from "@/context/context";
import { FabricImage } from "fabric";
import { useConvexMutation } from "@/hooks/use-convex-query";
import { api } from "@/convex/_generated/api";

// Unsplash API configuration
// Ensure this is exactly NEXT_PUBLIC_UNSPLASH_ACCESS_KEY in your .env.local
const UNSPLASH_ACCESS_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_ACCESS_KEY;
const UNSPLASH_API_URL = "https://api.unsplash.com";

export function BackgroundControls({ project }) {
  const { canvasEditor, processingMessage, setProcessingMessage } = useCanvas();
  const { mutate: updateProject } = useConvexMutation(api.projects.updateProject);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [searchQuery, setSearchQuery] = useState("");
  const [unsplashImages, setUnsplashImages] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isApplyingBackground, setIsApplyingBackground] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState(null);

  // Robust API Key handling
  const [activeApiKey, setActiveApiKey] = useState(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempKey, setTempKey] = useState("");

  useEffect(() => {
    // 1. Check env variable
    const envKey = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_ACCESS_KEY;

    // 2. Check localStorage for manual override
    const localKey = localStorage.getItem("unsplash_api_key");

    const finalKey = localKey || envKey;
    if (finalKey && finalKey !== "your_key_here") {
      setActiveApiKey(finalKey);
    }

    console.log("Unsplash key check:", {
      hasEnv: !!envKey,
      hasLocal: !!localKey,
      final: finalKey ? "Present" : "Missing"
    });
  }, []);

  const saveManualKey = () => {
    if (tempKey.trim()) {
      localStorage.setItem("unsplash_api_key", tempKey.trim());
      setActiveApiKey(tempKey.trim());
      setShowKeyInput(false);
      toast.success("API Key saved locally!");
    }
  };

  const clearManualKey = () => {
    localStorage.removeItem("unsplash_api_key");
    setActiveApiKey(process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY || null);
    toast.info("Local API key cleared.");
  };

  // Get the main image object from canvas
  const getMainImage = () => {
    if (!canvasEditor) return null;

    // 1. Check active object
    const activeObject = canvasEditor.getActiveObject();
    if (activeObject && (activeObject.type === "image" || activeObject instanceof FabricImage)) {
      console.log("Found active image object");
      return activeObject;
    }

    // 2. Check all objects
    const objects = canvasEditor.getObjects();
    const firstImage = objects.find((obj) => obj.type === "image" || obj instanceof FabricImage);
    if (firstImage) {
      console.log("Found first available image object");
      return firstImage;
    }

    // 3. Check canvas background image
    if (canvasEditor.backgroundImage && (canvasEditor.backgroundImage.type === "image" || canvasEditor.backgroundImage instanceof FabricImage)) {
      console.log("Found canvas background image");
      return canvasEditor.backgroundImage;
    }

    return null;
  };

  // Background removal using ImageKit AI (Server-side)
  const handleBackgroundRemoval = async () => {
    const mainImage = getMainImage();

    if (!mainImage) {
      toast.error("No image found to process. Please select or upload an image.");
      return;
    }

    if (!project) return;

    setProcessingMessage("Sending to AI Server...");

    try {
      // 1. Get image data from canvas
      const currentImageData = mainImage.toDataURL({ format: 'png' });

      if (!currentImageData || currentImageData.length < 100) {
        throw new Error("Failed to capture image data from canvas.");
      }

      // 2. Upload to ImageKit
      setProcessingMessage("Uploading image to Cloud AI...");

      const response = await fetch(currentImageData);
      const blob = await response.blob();
      const file = new File([blob], "bg-input.png", { type: "image/png" });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", `bg-input-${project._id}.png`);

      const uploadResponse = await fetch("/api/imagekit/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadData.success || !uploadData.url) {
        throw new Error(uploadData.error || "Failed to upload image to AI server.");
      }

      // 3. Apply AI Background Removal transformation
      // We use the ImageKit 'e-bgremove' transformation
      setProcessingMessage("AI is isolating the subject...");

      const ikUrl = uploadData.url;
      // Check if URL already has query params
      const separator = ikUrl.includes('?') ? '&' : '?';
      const bgRemovedUrl = `${ikUrl}${separator}tr=e-bgremove`;

      console.log("Loading AI processed image:", bgRemovedUrl);

      // Check if the transformed image is ready by testing the URL
      setProcessingMessage("Processing image with AI...");
      
      let isReady = false;
      // Poll for up to 40 seconds (20 times * 2 seconds)
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (i === 4) {
          setProcessingMessage("AI processing taking longer, please wait...");
        } else if (i === 10) {
          setProcessingMessage("Still processing, almost done...");
        }
        
        try {
          const testResponse = await fetch(bgRemovedUrl, { method: 'HEAD' });
          if (testResponse.ok) {
            isReady = true;
            break;
          }
        } catch (fetchError) {
          console.warn("URL test failed, retrying...", fetchError);
        }
      }

      if (!isReady) {
        throw new Error("AI background removal failed or timed out. The image may be too complex or the service is temporarily unavailable.");
      }

      // 4. Load the result back to Fabric.js with timeout
      const loadImagePromise = FabricImage.fromURL(bgRemovedUrl, {
        crossOrigin: 'anonymous'
      });

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Image loading timed out")), 30000);
      });

      const processedImage = await Promise.race([loadImagePromise, timeoutPromise]);

      if (!processedImage) {
        throw new Error("Failed to load processed image from AI server.");
      }

      // 5. Preserve original properties
      const props = {
        left: mainImage.left || canvasEditor.width / 2,
        top: mainImage.top || canvasEditor.height / 2,
        scaleX: mainImage.scaleX || 1,
        scaleY: mainImage.scaleY || 1,
        angle: mainImage.angle || 0,
        originX: mainImage.originX || "center",
        originY: mainImage.originY || "center",
        selectable: true,
        evented: true,
      };

      // 6. Replace on canvas
      if (mainImage === canvasEditor.backgroundImage) {
        canvasEditor.backgroundImage = null;
      } else if (canvasEditor.contains(mainImage)) {
        canvasEditor.remove(mainImage);
      }

      processedImage.set(props);
      canvasEditor.add(processedImage);
      processedImage.setCoords();
      canvasEditor.setActiveObject(processedImage);
      canvasEditor.calcOffset();
      canvasEditor.requestRenderAll();

      // 7. Save state to database
      setProcessingMessage("Saving project state...");
      const canvasJSON = canvasEditor.toJSON();
      await updateProject({
        projectId: project._id,
        canvasState: canvasJSON,
      });

      toast.success("Background removed successfully!");

    } catch (error) {
      console.error("ImageKit Background removal failed:", error);
      toast.error(`AI Error: ${error.message || "Something went wrong"}`);
    } finally {
      setProcessingMessage(null);
    }
  };

  // Set canvas background color
  const handleColorBackground = async () => {
    if (!canvasEditor) return;

    try {
      // In Fabric.js 6.7, set property directly and render
      canvasEditor.backgroundColor = backgroundColor;
      canvasEditor.requestRenderAll();

      // Persist to database
      await updateProject({
        projectId: project._id,
        canvasState: canvasEditor.toJSON(),
      });
    } catch (error) {
      console.error("Error setting background color:", error);
    }
  };

  // Remove canvas background (both color and image)
  const handleRemoveBackground = async () => {
    if (!canvasEditor) return;

    try {
      // Clear both background color and image
      canvasEditor.backgroundColor = null;
      canvasEditor.backgroundImage = null;
      canvasEditor.requestRenderAll();

      // Persist to database
      await updateProject({
        projectId: project._id,
        canvasState: canvasEditor.toJSON(),
      });
    } catch (error) {
      console.error("Error clearing background:", error);
    }
  };

  // Search Unsplash images
  const searchUnsplashImages = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    const keyToUse = activeApiKey;
    if (!keyToUse) {
      toast.error("Please configure an Unsplash API key first.");
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${UNSPLASH_API_URL}/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=12&client_id=${keyToUse}`
      );

      if (!response.ok) throw new Error("Failed to search images");

      const data = await response.json();
      setUnsplashImages(data.results || []);
    } catch (error) {
      console.error("Error searching Unsplash:", error);
      alert("Failed to search images. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  // Set image as canvas background
  const handleImageBackground = async (imageUrl, imageId) => {
    if (!canvasEditor || !project) return;

    setSelectedImageId(imageId);
    setIsApplyingBackground(true);
    try {
      // Download and trigger Unsplash download endpoint (required by Unsplash API)
      if (UNSPLASH_ACCESS_KEY) {
        fetch(`${UNSPLASH_API_URL}/photos/${imageId}/download`, {
          headers: {
            Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
          },
        }).catch(() => { }); // Silent fail for download tracking
      }

      // Create fabric image from URL
      const fabricImage = await FabricImage.fromURL(imageUrl, {
        crossOrigin: "anonymous",
      });

      // USE PROJECT DIMENSIONS or canvas dimensions for proper scaling
      const canvasWidth = project.width || canvasEditor.width;
      const canvasHeight = project.height || canvasEditor.height;

      // Calculate scales to FILL the canvas
      const scaleX = canvasWidth / fabricImage.width;
      const scaleY = canvasHeight / fabricImage.height;
      const scale = Math.max(scaleX, scaleY);

      fabricImage.set({
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center",
        left: canvasWidth / 2,
        top: canvasHeight / 2,
        selectable: false,
        evented: false,
      });

      // Set background and render
      canvasEditor.backgroundImage = fabricImage;
      canvasEditor.requestRenderAll();

      // Persist to database
      await updateProject({
        projectId: project._id,
        canvasState: canvasEditor.toJSON(),
      });

      console.log("Background image applied and saved successfully");
    } catch (error) {
      console.error("Error setting background image:", error);
      alert("Failed to set background image. Please try again.");
    } finally {
      setSelectedImageId(null);
      setIsApplyingBackground(false);
    }
  };

  // Handle search on Enter key
  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") {
      searchUnsplashImages();
    }
  };

  if (!canvasEditor) {
    return (
      <div className="p-4">
        <p className="text-white/70 text-sm">Canvas not ready</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Background Removal Button - Outside of tabs */}
      <div className="space-y-4 pb-4 border-b border-white/10">
        <div>
          <h3 className="text-sm font-medium text-white mb-2">
            AI Background Removal
          </h3>
          <p className="text-xs text-white/70 mb-4">
            Automatically remove the background from your image using AI
          </p>
        </div>

        <Button
          onClick={handleBackgroundRemoval}
          disabled={processingMessage || !getMainImage()}
          className="w-full"
          variant="primary"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remove Image Background
        </Button>

        {!getMainImage() && (
          <p className="text-xs text-amber-400">
            Please add an image to the canvas first to remove its background
          </p>
        )}
      </div>

      {/* Shadcn UI Tabs */}
      <Tabs defaultValue="color" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-700/50">
          <TabsTrigger
            value="color"
            className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white"
          >
            <Palette className="h-4 w-4 mr-2" />
            Color
          </TabsTrigger>
          <TabsTrigger
            value="image"
            className="data-[state=active]:bg-cyan-500 data-[state=active]:text-white"
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Image
          </TabsTrigger>
        </TabsList>

        {/* Color Background Tab */}
        <TabsContent value="color" className="space-y-4 mt-6">
          <div>
            <h3 className="text-sm font-medium text-white mb-2">
              Solid Color Background
            </h3>
            <p className="text-xs text-white/70 mb-4">
              Choose a solid color for your canvas background
            </p>
          </div>

          <div className="space-y-4">
            <HexColorPicker
              color={backgroundColor}
              onChange={setBackgroundColor}
              style={{ width: "100%" }}
            />

            <div className="flex items-center gap-2">
              <Input
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                placeholder="#ffffff"
                className="flex-1 bg-slate-700 border-white/20 text-white"
              />
              <div
                className="w-10 h-10 rounded border border-white/20"
                style={{ backgroundColor }}
              />
            </div>

            <Button
              onClick={handleColorBackground}
              className="w-full"
              variant="primary"
            >
              <Palette className="h-4 w-4 mr-2" />
              Apply Color
            </Button>
          </div>
        </TabsContent>

        {/* Image Background Tab */}
        <TabsContent value="image" className="space-y-4 mt-6">
          <div>
            <p className="text-muted-foreground text-sm mb-6">
              Remove or change background{" "}
              <span className="text-[10px] opacity-30 select-none">v2.1</span>
            </p>
            <p className="text-xs text-white/70 mb-4">
              Search and use high-quality images from Unsplash
            </p>
          </div>

          {/* Search Bar */}
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleSearchKeyPress}
              placeholder="Search for backgrounds..."
              className="flex-1 bg-slate-700 border-white/20 text-white"
            />
            <Button
              onClick={searchUnsplashImages}
              disabled={isSearching || !searchQuery.trim()}
              variant="primary"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Search Results */}
          {unsplashImages?.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-white">
                Search Results ({unsplashImages?.length})
              </h4>
              <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                {unsplashImages.map((image) => (
                  <div
                    key={image.id}
                    className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-cyan-400 transition-colors"
                    onClick={() =>
                      handleImageBackground(image.urls.regular, image.id)
                    }
                  >
                    <img
                      src={image.urls.small}
                      alt={image.alt_description || "Background image"}
                      className="w-full h-24 object-cover"
                    />

                    {/* Loading overlay */}
                    {selectedImageId === image.id && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Download className="h-5 w-5 text-white" />
                    </div>

                    {/* Attribution */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                      <p className="text-xs text-white/80 truncate">
                        by {image.user.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isSearching && unsplashImages?.length === 0 && searchQuery && (
            <div className="text-center py-8">
              <ImageIcon className="h-12 w-12 text-white/30 mx-auto mb-3" />
              <p className="text-white/70 text-sm">
                No images found for "{searchQuery}"
              </p>
              <p className="text-white/50 text-xs">
                Try a different search term
              </p>
            </div>
          )}

          {/* Initial state */}
          {!searchQuery && unsplashImages?.length === 0 && (
            <div className="text-center py-8">
              <Search className="h-12 w-12 text-white/30 mx-auto mb-3" />
              <p className="text-white/70 text-sm">
                Search for background images
              </p>
              <p className="text-white/50 text-xs">Powered by Unsplash</p>
            </div>
          )}

          {/* API key configuration - Fallback for when .env fails */}
          {!activeApiKey ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <h4 className="text-amber-400 text-xs font-bold mb-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Unsplash Search Disabled
              </h4>
              <p className="text-amber-400/80 text-[10px] leading-tight mb-3">
                Next.js might not be loading your <code>.env.local</code>{" "}
                correctly. You can paste your key directly here to enable
                search:
              </p>

              <div className="flex gap-2 mb-3">
                <Input
                  type="password"
                  placeholder="Paste Unsplash Access Key"
                  value={tempKey}
                  onChange={(e) => setTempKey(e.target.value)}
                  className="h-8 text-[10px] bg-black/30 border-white/10"
                />
                <Button
                  size="sm"
                  onClick={saveManualKey}
                  className="h-8 px-2 text-[10px]"
                >
                  Save
                </Button>
              </div>

              <div className="bg-black/20 p-2 rounded mb-2">
                <p className="text-white/70 text-[10px] font-mono">
                  # Or check .env.local for:
                  <br />
                  NEXT_PUBLIC_UNSPLASH_ACCESS_KEY=...
                </p>
              </div>
              <a
                href="https://unsplash.com/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 text-[10px] hover:underline block"
              >
                Get a free API key here &rarr;
              </a>
            </div>
          ) : (
            <div className="flex justify-between items-center bg-green-500/5 p-2 rounded border border-green-500/10">
              <p className="text-[10px] text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> API Key Active
              </p>
              <Button
                variant="ghost"
                onClick={clearManualKey}
                className="h-6 px-1 text-[9px] text-white/40 hover:text-white"
              >
                Reset
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Maintenance Section */}
      <div className="pt-6 mt-4 border-t border-white/10 opacity-40 hover:opacity-100 transition-opacity pb-6">
        <p className="text-[10px] text-white/50 mb-2 uppercase tracking-widest font-bold">
          System Maintenance
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-8 text-[10px] border border-white/5 hover:bg-white/5"
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }}
        >
          <Loader2 className="h-3 w-3 mr-2" />
          Force Full System Reset
        </Button>
      </div>
    </div>
  );
}
