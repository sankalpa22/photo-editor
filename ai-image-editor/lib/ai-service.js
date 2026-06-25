
import { env, pipeline, RawImage } from '@xenova/transformers';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

class LocalAIService {
    static instance = null;
    static modelId = 'Xenova/rmbg-1.4';

    constructor() {
        this.segmenter = null;
        this.isloading = false;
        this.progressCallback = null;
    }

    static getInstance() {
        if (!LocalAIService.instance) {
            LocalAIService.instance = new LocalAIService();
        }
        return LocalAIService.instance;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    async loadModel() {
        if (this.segmenter) return;

        this.isloading = true;
        try {
            console.log("Initializing segmentation pipeline...");
            this.segmenter = await pipeline('image-segmentation', LocalAIService.modelId, {
                progress_callback: (p) => {
                    if (this.progressCallback && p) {
                        // Manually copy properties to avoid spreading potentially null/undefined values
                        const progressUpdate = { status: 'downloading' };
                        if (typeof p.progress === 'number') progressUpdate.progress = p.progress;
                        if (typeof p.loaded === 'number') progressUpdate.loaded = p.loaded;
                        if (typeof p.total === 'number') progressUpdate.total = p.total;
                        if (p.file) progressUpdate.file = p.file;

                        this.progressCallback(progressUpdate);
                    }
                }
            });
            this.isloading = false;
        } catch (error) {
            this.isloading = false;
            console.error("Failed to load local AI model:", error);
            throw error;
        }
    }

    async removeBackground(imageSource) {
        console.log("TRACE 10: removeBackground started");
        try {
            if (!this.segmenter) {
                console.log("TRACE 11: Loading model");
                await this.loadModel();
            }

            if (this.progressCallback) {
                this.progressCallback({ status: 'processing', message: 'Analyzing image...' });
            }

            if (!imageSource) {
                throw new Error("Image source is missing or empty");
            }

            console.log("TRACE 12: Loading image from source");
            const image = await RawImage.fromURL(imageSource);
            console.log("TRACE 13: Image loaded", image.width, "x", image.height);

            console.log("TRACE 14: Running segmenter");
            const output = await this.segmenter(image);
            console.log("TRACE 15: AI output received");

            // Extremely safe mask extraction
            let mask = null;
            if (output) {
                if (output.mask && output.mask.data) {
                    mask = output.mask;
                } else if (output.data) {
                    mask = output;
                } else if (Array.isArray(output) && output.length > 0) {
                    const first = output[0];
                    mask = (first && first.mask && first.mask.data) ? first.mask : (first && first.data ? first : null);
                }
            }

            if (!mask || !mask.data) {
                console.error("TRACE 16 ERROR: Invalid mask structure", typeof output);
                throw new Error("AI model failed to generate a background mask.");
            }

            if (!image.width || !image.height || image.width > 8192 || image.height > 8192) {
                console.error("TRACE 17 ERROR: Invalid image dimensions", image.width, "x", image.height);
                throw new Error("AI tool received an image with invalid dimensions.");
            }

            console.log("TRACE 17: Mask validated", mask.width, "x", mask.height);

            // Create result canvas
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            console.log("TRACE 18: Drawing original image to temp canvas");
            const imageCanvas = image.toCanvas();
            ctx.drawImage(imageCanvas, 0, 0);

            console.log("TRACE 19: Applying mask pixels");
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixelData = imageData.data;
            const maskData = mask.data;
            const pixelCount = canvas.width * canvas.height;

            let min = 255;
            let max = 0;
            for (let i = 0; i < pixelCount; i++) {
                const val = maskData[i] || 0;
                if (val < min) min = val;
                if (val > max) max = val;
            }
            console.log("TRACE 20: Mask stats", { min, max });

            const scale = max <= 1.0 ? 255 : 1;
            for (let i = 0; i < pixelCount; i++) {
                const alpha = (maskData[i] || 0) * scale;
                pixelData[i * 4 + 3] = alpha;
            }

            console.log("TRACE 21: Finalizing image");
            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/png');

        } catch (error) {
            console.error("TRACE ERROR: removeBackground failed", error);
            throw error;
        }
    }
}

export const localAI = LocalAIService.getInstance();
