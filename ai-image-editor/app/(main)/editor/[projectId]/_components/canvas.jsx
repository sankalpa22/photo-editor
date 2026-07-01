import { useCanvas } from "@/context/context";
import { api } from "@/convex/_generated/api";
import { useConvexMutation } from "@/hooks/use-convex-query";
import { Canvas, FabricImage } from "fabric";
import React, { useEffect, useRef, useState } from "react";

function CanvasEditor({ project }) {
  const canvasRef = useRef();
  const containerRef = useRef();
  const { canvasEditor, setCanvasEditor, activeTool, onToolChange } =
    useCanvas();
  const [isLoading, setIsLoading] = useState(true);

  const { mutate: updateProject } = useConvexMutation(
    api.projects.updateProject
  );

  const calculateViewportScale = () => {
    if (!containerRef.current || !project) return 1;
    const container = containerRef.current;
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    const scaleX = containerWidth / project.width;
    const scaleY = containerHeight / project.height;
    return Math.min(scaleX, scaleY, 1);
  };

  useEffect(() => {
    if (!canvasRef.current || !project || canvasEditor) return;

    const initializeCanvas = async () => {
      setIsLoading(true);

      const viewportScale = calculateViewportScale();
      const canvas = new Canvas(canvasRef.current, {
        width: project.width,
        height: project.height,
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
        controlsAboveOverlay: true,
        selection: true,
        hoverCursor: "move",
        moveCursor: "move",
        defaultCursor: "default",
        allowTouchScrolling: false,
        renderOnAddRemove: true,
        skipTargetFind: false,
      });

      // Sync both lower and upper canvas layers
      canvas.setDimensions(
        {
          width: project.width * viewportScale,
          height: project.height * viewportScale,
        },
        { backstoreOnly: false }
      );

      canvas.setZoom(viewportScale);

      canvas.setZoom(viewportScale);

      // Load image
      if (project.currentImageUrl || project.originalImageUrl) {
        try {
          const imageUrl = project.currentImageUrl || project.originalImageUrl;
          
          // Test URL accessibility first
          try {
            const testResponse = await fetch(imageUrl, { method: 'HEAD' });
            if (!testResponse.ok) {
              console.warn(`Image URL not accessible: ${testResponse.status}`, imageUrl);
              // Continue anyway, Fabric.js might handle it
            }
          } catch (fetchError) {
            console.warn("Could not test image URL accessibility:", fetchError);
          }

          const fabricImage = await FabricImage.fromURL(imageUrl, {
            crossOrigin: "anonymous",
          });

          const imgAspectRatio = fabricImage.width / fabricImage.height;
          const canvasAspectRatio = project.width / project.height;
          let scaleX, scaleY;

          if (imgAspectRatio > canvasAspectRatio) {
            scaleX = project.width / fabricImage.width;
            scaleY = scaleX;
          } else {
            scaleY = project.height / fabricImage.height;
            scaleX = scaleY;
          }

          fabricImage.set({
            left: project.width / 2,
            top: project.height / 2,
            originX: "center",
            originY: "center",
            scaleX,
            scaleY,
            selectable: true,
            evented: true,
          });

          canvas.add(fabricImage);
          canvas.centerObject(fabricImage);
        } catch (error) {
          console.error("Error loading project image:", error);
          // Don't throw here, just log the error and continue without the image
        }
      }

      // Load saved canvas state
      if (project.canvasState) {
        try {
          await canvas.loadFromJSON(project.canvasState);
          canvas.requestRenderAll();
        } catch (error) {
          console.error("Error loading canvas state:", error);
        }
      }

      canvas.calcOffset();
      canvas.requestRenderAll();
      setCanvasEditor(canvas);

      setTimeout(() => {
        // workaround for initial resize issues
        window.dispatchEvent(new Event("resize"));
      }, 500);

      setIsLoading(false);
    };

    initializeCanvas();

    return () => {
      if (canvasEditor) {
        canvasEditor.dispose();
        setCanvasEditor(null);
      }
    };
  }, [project]);

  const saveCanvasState = async () => {
    if (!canvasEditor || !project) return;

    try {
      const canvasJSON = canvasEditor.toJSON();
      await updateProject({
        projectId: project._id,
        canvasState: canvasJSON,
      });
    } catch (error) {
      console.error("Error saving canvas state:", error);
    }
  };

  useEffect(() => {
    if (!canvasEditor) return;
    let saveTimeout;

    const handleCanvasChange = async () => {
      // --- AUTO EXPAND LOGIC ---
      const currentZoom = canvasEditor.getZoom() || 1;
      const canvasW = canvasEditor.width / currentZoom;
      const canvasH = canvasEditor.height / currentZoom;
      let minX = 0;
      let minY = 0;
      let maxX = canvasW;
      let maxY = canvasH;

      // Filter out utility overlays like crop rectangles
      const objects = canvasEditor.getObjects().filter(o => o.name !== "cropRect");
      
      if (objects.length > 0) {
        objects.forEach((obj) => {
          obj.setCoords();
          const { tl, tr, bl, br } = obj.aCoords;
          const left = Math.min(tl.x, tr.x, bl.x, br.x);
          const top = Math.min(tl.y, tr.y, bl.y, br.y);
          const right = Math.max(tl.x, tr.x, bl.x, br.x);
          const bottom = Math.max(tl.y, tr.y, bl.y, br.y);

          if (left < minX) minX = left;
          if (top < minY) minY = top;
          if (right > maxX) maxX = right;
          if (bottom > maxY) maxY = bottom;
        });

        let newWidth = canvasW;
        let newHeight = canvasH;
        let shiftX = 0;
        let shiftY = 0;

        if (minX < 0) {
          shiftX = Math.abs(minX);
          newWidth += shiftX;
        }
        if (minY < 0) {
          shiftY = Math.abs(minY);
          newHeight += shiftY;
        }
        if (maxX > canvasW) newWidth += (maxX - canvasW);
        if (maxY > canvasH) newHeight += (maxY - canvasH);

        if (newWidth > canvasW || newHeight > canvasH) {
          const padding = 40; // Add padding to comfortably fit the image
          
          if (shiftX > 0) { shiftX += padding; newWidth += padding; }
          if (shiftY > 0) { shiftY += padding; newHeight += padding; }
          if (maxX > canvasW) newWidth += padding;
          if (maxY > canvasH) newHeight += padding;

          newWidth = Math.round(newWidth);
          newHeight = Math.round(newHeight);

          // Immediately reflect structural shift locally
          if (shiftX > 0 || shiftY > 0) {
            objects.forEach((obj) => {
              obj.set({
                left: obj.left + shiftX,
                top: obj.top + shiftY
              });
              obj.setCoords();
            });
          }

          canvasEditor.setWidth(newWidth);
          canvasEditor.setHeight(newHeight);

          // Soften the jump by recomputing viewport scaling limits
          const container = containerRef.current;
          if (container) {
            const containerWidth = container.clientWidth - 40;
            const containerHeight = container.clientHeight - 40;
            const scaleX = containerWidth / newWidth;
            const scaleY = containerHeight / newHeight;
            const newScale = Math.min(scaleX, scaleY, 1);

            canvasEditor.setDimensions(
              { width: newWidth * newScale, height: newHeight * newScale },
              { backstoreOnly: false }
            );
            canvasEditor.setZoom(newScale);
          }

          canvasEditor.calcOffset();
          canvasEditor.requestRenderAll();
          
          // Force a master save capturing the new dimensions & positions simultaneously
          try {
            await updateProject({
              projectId: project._id,
              width: newWidth,
              height: newHeight,
              canvasState: canvasEditor.toJSON(),
            });
          } catch (e) {
            console.error("Auto expand update error:", e);
          }

          return; 
        }
      }

      // No expansion needed -> Normal Save Debouncing
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveCanvasState();
      }, 2000);
    };

    const handleStandardSave = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveCanvasState();
      }, 2000);
    };

    canvasEditor.on("object:modified", handleCanvasChange);
    canvasEditor.on("object:added", handleStandardSave);
    canvasEditor.on("object:removed", handleStandardSave);

    return () => {
      clearTimeout(saveTimeout);
      canvasEditor.off("object:modified", handleCanvasChange);
      canvasEditor.off("object:added", handleStandardSave);
      canvasEditor.off("object:removed", handleStandardSave);
    };
  }, [canvasEditor]);

  useEffect(() => {
    if (!canvasEditor) return;

    switch (activeTool) {
      case "crop":
        canvasEditor.defaultCursor = "crosshair";
        canvasEditor.hoverCursor = "crosshair";
        break;
      default:
        canvasEditor.defaultCursor = "default";
        canvasEditor.hoverCursor = "move";
    }
  }, [canvasEditor, activeTool]);

  useEffect(() => {
    if (!containerRef.current || !canvasEditor || !project) return;

    const resizeObserver = new ResizeObserver(() => {
      const newScale = calculateViewportScale();
      canvasEditor.setDimensions(
        {
          width: project.width * newScale,
          height: project.height * newScale,
        },
        { backstoreOnly: false }
      );
      canvasEditor.setZoom(newScale);
      canvasEditor.calcOffset();
      canvasEditor.requestRenderAll();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasEditor, project]);

  // Handle automatic tab switching when text is selected
  useEffect(() => {
    if (!canvasEditor || !onToolChange) return;

    const handleSelection = (e) => {
      const selectedObject = e.selected?.[0];
      if (selectedObject && selectedObject.type === "i-text") {
        onToolChange("text");
      }
    };

    canvasEditor.on("selection:created", handleSelection);
    canvasEditor.on("selection:updated", handleSelection);

    return () => {
      canvasEditor.off("selection:created", handleSelection);
      canvasEditor.off("selection:updated", handleSelection);
    };
  }, [canvasEditor, onToolChange]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center bg-secondary w-full h-full overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #64748b 25%, transparent 25%),
            linear-gradient(-45deg, #64748b 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #64748b 75%),
            linear-gradient(-45deg, transparent 75%, #64748b 75%)`,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
            <p className="text-white/70 text-sm">Loading canvas...</p>
          </div>
        </div>
      )}

      <div className="px-5">
        <canvas id="canvas" className="border" ref={canvasRef} />
      </div>
    </div>
  );
}

export default CanvasEditor;
