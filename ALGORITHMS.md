# EasyEdit — Image Processing Algorithms

This document explains the three hand-written, deterministic image-processing
algorithms implemented in EasyEdit, with the mathematics, step-by-step
procedure, and a worked numerical example for each.

All three are pure client-side algorithms that read the raw image pixels with
the Canvas `getImageData()` API, run a deterministic computation, and write the
result back. Shared plumbing (pixel reading, luminance, histogram, upload) lives
in `app/(main)/editor/[projectId]/_components/_tools/pixel-utils.js`.

A recurring building block is **luminance** (perceived brightness), computed
with the Rec. 601 luma weights:

```
Y = 0.299·R + 0.587·G + 0.114·B
```

---

## 1. Auto Enhance — Histogram Equalization

**File:** `_tools/auto-enhance.jsx`
**Type:** Global point operation / contrast enhancement (histogram-based)

### 1.1 What it does
Histogram equalization improves contrast by spreading the most frequent
brightness values across the full 0–255 range. Dull, low-contrast images (where
all pixels are bunched into a narrow band of brightness) are stretched so that
the brightness distribution becomes approximately uniform (flat).

### 1.2 Intuition
The **cumulative distribution function (CDF)** of brightness tells us, for each
level `k`, what fraction of pixels are darker than or equal to `k`. If we use
that CDF itself as the remapping function, frequently-occurring brightness
levels (steep parts of the CDF) get spread far apart, while rarely-occurring
levels get compressed — which is exactly what flattens the histogram.

### 1.3 The mathematics
Let the image have `N` pixels and 256 brightness levels.

1. Histogram: `h[k]` = number of pixels with luminance `k`.
2. Cumulative distribution: `cdf[k] = h[0] + h[1] + … + h[k]`.
3. Transfer function (the lookup table), normalised so the darkest present
   level maps to 0 and the brightest present level maps to 255:

```
            ( cdf[k] − cdf_min )
map[k] = round( ------------------- × 255 )
            (    N  −  cdf_min   )
```

where `cdf_min` is the first non-zero CDF value.

4. Each pixel's luminance `Y` is replaced by `map[Y]`, and the colour is
   preserved by scaling each channel by the ratio `newY / Y`:

```
ratio = map[Y] / Y
R' = R · ratio,   G' = G · ratio,   B' = B · ratio
```

5. A **strength** parameter `s ∈ [0,1]` blends original and equalized luminance
   so the effect can be dialled down: `newY = Y + (map[Y] − Y)·s`.

### 1.4 Worked numerical example
Take an 8-level image (`L = 8`, so we scale by `L−1 = 7`) of `N = 4096` pixels
with this histogram (a classic low-contrast, dark-biased image):

| level k | count h[k] | cdf[k] | (cdf−cdf_min)/(N−cdf_min) | ×7, rounded → map[k] |
|:------:|:----------:|:------:|:-------------------------:|:--------------------:|
| 0 | 790  | 790  | 0.000 | **0** |
| 1 | 1023 | 1813 | 0.309 | **2** |
| 2 | 850  | 2663 | 0.567 | **4** |
| 3 | 656  | 3319 | 0.765 | **5** |
| 4 | 329  | 3648 | 0.865 | **6** |
| 5 | 245  | 3893 | 0.939 | **7** |
| 6 | 122  | 4015 | 0.976 | **7** |
| 7 | 81   | 4096 | 1.000 | **7** |

Here `cdf_min = 790` and `N − cdf_min = 3306`. Example for level 2:
`(2663 − 790) / 3306 × 7 = 0.567 × 7 = 3.97 → 4`.

**Result:** the old levels `{0,1,2,3,4,5,6,7}` are remapped to
`{0,2,4,5,6,7,7,7}`. Notice the dark levels (0–3), which contained most of the
pixels, are now stretched apart (0→0, 1→2, 2→4, 3→5), increasing contrast, while
the sparse bright levels are compressed into 7.

**Colour-preserving step (in full 0–255 scale):** a pixel `RGB = (50, 100, 150)`
has `Y = 0.299·50 + 0.587·100 + 0.114·150 ≈ 91`. Suppose `map[91] = 130`. Then
`ratio = 130/91 = 1.43`, giving `RGB' = (71, 143, 214)`. The channel ratios
`50:100:150` and `71:143:214` are both ≈ `1:2:3`, so the **hue is unchanged** —
only brightness/contrast moved.

### 1.5 Complexity
`O(N + 256) = O(N)` — one pass to build the histogram, a constant-size lookup
table, and one pass to remap pixels.

---

## 2. Edge Detection — Sobel Operator

**File:** `_tools/sobel-edge.jsx`
**Type:** Spatial filter / first-derivative (gradient) edge detector (convolution)

### 2.1 What it does
Sobel highlights edges — places where brightness changes sharply — by estimating
the **gradient** of the image. The output is bright where edges are strong and
dark in flat regions, producing a white-on-black outline of the image.

### 2.2 Intuition
An edge is a rapid change in brightness. In calculus the rate of change is the
**derivative**. For a 2-D image `I(x,y)`, Sobel approximates the two partial
derivatives `∂I/∂x` and `∂I/∂y` using two 3×3 convolution kernels:

```
        -1  0  +1                 -1  -2  -1
  Gx =  -2  0  +2          Gy =    0   0   0
        -1  0  +1                 +1  +2  +1
```

`Gx` responds to horizontal brightness change (→ vertical edges); `Gy` responds
to vertical change (→ horizontal edges). The `1-2-1` weights also apply mild
smoothing perpendicular to the derivative, which suppresses noise.

### 2.3 The mathematics
For each pixel, **convolution** multiplies each kernel weight by the luminance
of the pixel beneath it and sums the nine products, giving `Gx` and `Gy`. The
two are combined into an edge strength (gradient magnitude) and direction:

```
magnitude = √(Gx² + Gy²)          (clamped to 0–255)
direction = atan2(Gy, Gx)
```

An optional **threshold** keeps only strong edges (`magnitude ≥ t → 255`, else
`0`), and an **invert** option swaps to dark edges on white.

### 2.4 Worked numerical example
Consider a 3×3 neighbourhood straddling a vertical edge (dark on the left,
bright on the right). Values are luminance:

```
  10   10   200
  10   10   200
  10   10   200
```

Apply `Gx`:
```
Gx = (-1·10) + (0·10) + (+1·200)
   + (-2·10) + (0·10) + (+2·200)
   + (-1·10) + (0·10) + (+1·200)
   = 190 + 380 + 190 = 760
```
Apply `Gy`:
```
Gy = (-1·10) + (-2·10) + (-1·200)
   + ( 0·10) + ( 0·10) + ( 0·200)
   + (+1·10) + (+2·10) + (+1·200)
   = (-230) + 0 + (230) = 0
```
Magnitude: `√(760² + 0²) = 760 → clamped to 255` (a strong edge). Direction:
`atan2(0, 760) = 0°` — the gradient points horizontally, i.e. the edge itself is
**vertical**, which is correct.

**Flat region check** — every pixel equal to 100:
```
Gx = (-100+100) + (-200+200) + (-100+100) = 0
Gy = (-100-200-100) + 0 + (100+200+100) = 0
magnitude = 0   → no edge (correct)
```

### 2.5 Complexity
`O(N)` — a fixed 9-tap convolution at every pixel. Border pixels (which lack a
full 3×3 neighbourhood) are left at 0.

---

## 3. Threshold — Otsu's Method

**File:** `_tools/otsu-threshold.jsx`
**Type:** Automatic thresholding / image segmentation (histogram statistics)

### 3.1 What it does
Otsu converts a grayscale image into pure black & white by **automatically**
choosing the single best brightness cut-off `t`: pixels with luminance `> t`
become white, the rest black. No manual tuning is needed.

### 3.2 Intuition
Split all pixels into two classes at threshold `t` — "dark" (`≤ t`) and "light"
(`> t`). A good threshold makes the two classes as cleanly separated as
possible. Otsu measures separation with the **between-class variance** and picks
the `t` that maximises it.

### 3.3 The mathematics
For each candidate threshold `t` (0…255):

- `w0`, `w1` — number (or fraction) of pixels in the dark / light class
- `μ0`, `μ1` — mean luminance of the dark / light class
- Between-class variance:

```
σ²_B(t) = w0 · w1 · (μ0 − μ1)²
```

Otsu chooses `t* = argmax σ²_B(t)`. This works because total variance is
constant, so **maximising between-class variance is equivalent to minimising the
variance inside each class** — the two groups become as tight and as far apart
as possible. The histogram is built once and the means are updated incrementally
as `t` increases, so the sweep is cheap.

### 3.4 Worked numerical example
A 16-pixel image (`N = 16`) with this bimodal histogram (humps at level 1 and 4):

| level | count | i·count |
|:-----:|:-----:|:-------:|
| 0 | 2 | 0  |
| 1 | 4 | 4  |
| 2 | 2 | 4  |
| 3 | 2 | 6  |
| 4 | 4 | 16 |
| 5 | 2 | 10 |

Total sum = 40, so the overall mean `μ_T = 40/16 = 2.5`. Now evaluate
`σ²_B(t) = w0·w1·(μ0−μ1)²` for each threshold (class 0 = levels `≤ t`):

| t | w0 | μ0 | w1 | μ1 | (μ0−μ1)² | σ²_B = w0·w1·(μ0−μ1)² |
|:-:|:--:|:----:|:--:|:----:|:--------:|:---------------------:|
| 0 | 2  | 0.00 | 14 | 2.86 | 8.16 | 228.6 |
| 1 | 6  | 0.67 | 10 | 3.60 | 8.60 | 516.2 |
| 2 | 8  | 1.00 | 8  | 4.00 | 9.00 | **576.0** |
| 3 | 10 | 1.40 | 6  | 4.33 | 8.60 | 516.2 |
| 4 | 14 | 2.14 | 2  | 5.00 | 8.16 | 228.6 |

The maximum between-class variance is at **t = 2**. So Otsu picks `t* = 2`:
levels `{0,1,2}` → black, levels `{3,4,5}` → white. This lands the threshold
exactly in the valley between the two humps (1 and 4), separating them cleanly —
which is precisely what a human would choose by eye.

### 3.5 Complexity
`O(N + 256)` — build the luminance histogram (`O(N)`), then sweep 256 thresholds
with incremental mean updates (`O(256)`).

---

## 4. Color Segmentation — K-Means Clustering

**File:** `_tools/kmeans-segmentation.jsx`
**Type:** Unsupervised Machine Learning / Color Quantization

### 4.1 What it does
K-Means groups the millions of colors in an image into exactly $K$ discrete color clusters. It replaces each pixel's color with its closest cluster center (centroid), producing a segmented, stylized "posterized" image and extracting the dominant color palette.

### 4.2 Intuition
Colors in an image can be represented as 3D coordinate points in RGB space: $[R, G, B]^T$. To simplify the colors, we want to find $K$ optimal color points (centroids) such that the sum of distances between every pixel and its nearest centroid is minimized. 

Because running multiple iterations on millions of pixels is computationally heavy for browser engines, we optimize this by running the clustering iterations on a sub-sampled representative set of 10,000 pixels. Once the centroids converge, we map all pixels in the full-resolution image to their nearest centroid in a single pass.

### 4.3 The mathematics
Let the image have $N$ pixels, represented as 3D vectors $\mathbf{x}_i = [R_i, G_i, B_i]^T$.

1. **Centroid Initialization:** Select $K$ unique pixel colors randomly from the sub-sample to serve as initial cluster centers:
   $$\mathbf{C} = \{\mathbf{c}_1, \mathbf{c}_2, \dots, \mathbf{c}_K\}$$

2. **Cluster Assignment:** For each sampled pixel $\mathbf{x}_i$, compute the squared Euclidean distance to all $K$ centroids:
   $$d^2(\mathbf{x}_i, \mathbf{c}_j) = (R_i - R_{cj})^2 + (G_i - G_{cj})^2 + (B_i - B_{cj})^2$$
   Assign the pixel to the cluster $S_j$ of the closest centroid:
   $$\mathbf{x}_i \in S_j \iff d^2(\mathbf{x}_i, \mathbf{c}_j) \le d^2(\mathbf{x}_i, \mathbf{c}_l) \quad \forall l \in [1, K]$$

3. **Centroid Update:** Recalculate each cluster's centroid as the mean of its assigned pixels:
   $$\mathbf{c}_j^{(new)} = \frac{1}{|S_j|} \sum_{\mathbf{x}_i \in S_j} \mathbf{x}_i$$

4. **Convergence:** Repeat Assignment and Update steps until the cumulative shift of centroids drops below a delta threshold ($\sum \|\mathbf{c}_j^{(new)} - \mathbf{c}_j^{(old)}\| < 1$) or the iteration count reaches a safety limit (15 iterations).

5. **Global Reconstruction:** Map every pixel in the full-resolution image to its closest converged centroid and update the canvas image.

### 4.4 Worked numerical example
Let $K = 2$, and we cluster 4 pixels: $P_1(10, 10, 10)$, $P_2(20, 20, 20)$, $P_3(200, 200, 200)$, $P_4(220, 220, 220)$.
1. **Initialize:** Randomly choose initial centroids $\mathbf{c}_1 = (10, 10, 10)$ and $\mathbf{c}_2 = (200, 200, 200)$.
2. **Assign Iteration 1:**
   - $P_1$: closest to $\mathbf{c}_1$ (dist 0). Assigned to $S_1$.
   - $P_2$: closest to $\mathbf{c}_1$ (dist 300). Assigned to $S_1$.
   - $P_3$: closest to $\mathbf{c}_2$ (dist 0). Assigned to $S_2$.
   - $P_4$: closest to $\mathbf{c}_2$ (dist 1200). Assigned to $S_2$.
3. **Update Iteration 1:**
   - $\mathbf{c}_1^{(new)} = \text{mean}(P_1, P_2) = (15, 15, 15)$
   - $\mathbf{c}_2^{(new)} = \text{mean}(P_3, P_4) = (210, 210, 210)$
4. **Assign Iteration 2:**
   - Assignments remain identical since boundaries didn't cross.
5. **Convergence:** Centroids do not move. Final segmented colors are $(15, 15, 15)$ for dark pixels and $(210, 210, 210)$ for light pixels.

### 4.5 Complexity
`O(I · K · S + K · N)` where:
- $S = 10,000$ (sub-sampled pixel count for centroid updates).
- $I \le 15$ (iteration count).
- $K \in [2, 16]$ (number of color clusters).
- $N = \text{Width} \times \text{Height}$ (total image pixels for final single-pass mapping).
This hybrid design runs in under 100ms for megapixel images in browser environments.

---

---

## 5. Smoothing Filters — Gaussian Blur

**File:** `_tools/blur.jsx`
**Type:** Local neighborhood operation / low-pass filter (spatial convolution)

### 5.1 What it does
Gaussian Blur applies a smoothing filter to the image, filtering out high-frequency noise and details. It creates a soft, out-of-focus effect (similar to viewing through a frosted lens).

### 5.2 Intuition & Separability
A 2D Gaussian filter convolved over a neighborhood of size $(2r+1) \times (2r+1)$ requires $(2r+1)^2$ multiplications per pixel. However, the Gaussian function is **separable**, meaning a 2D Gaussian kernel can be represented as the product of two 1D Gaussian kernels:
$$G(x, y) = G(x) \cdot G(y) = \left( \frac{1}{\sqrt{2\pi}\sigma} e^{-\frac{x^2}{2\sigma^2}} \right) \cdot \left( \frac{1}{\sqrt{2\pi}\sigma} e^{-\frac{y^2}{2\sigma^2}} \right)$$

This allows us to perform the convolving in two sequential 1D passes:
1. Convolve each row horizontally with the 1D Gaussian kernel.
2. Convolve each column of the result vertically with the same 1D Gaussian kernel.
This reduces the computational complexity per pixel from $O(R^2)$ to $O(2R)$, which is significantly faster for larger blur radii.

### 5.3 The mathematics
Given a radius $r$ and standard deviation $\sigma = \max(r/2, 0.5)$:
1. **1D Gaussian Kernel:** Construct an array of size $2r+1$ where for $x \in [-r, r]$:
   $$K[x + r] = e^{-\frac{x^2}{2\sigma^2}}$$
   Normalize the kernel so the weights sum to 1:
   $$K_{norm}[i] = \frac{K[i]}{\sum_{j=0}^{2r} K[j]}$$

2. **Horizontal Pass:**
   $$I_{temp}(x, y) = \sum_{k=-r}^{r} I(x + k, y) \cdot K_{norm}[k + r]$$
   Boundary pixels where $x + k < 0$ or $x + k \ge W$ are handled by replicating the edge pixel (clamping coordinate to $[0, W-1]$).

3. **Vertical Pass:**
   $$I_{out}(x, y) = \sum_{k=-r}^{r} I_{temp}(x, y + k) \cdot K_{norm}[k + r]$$
   Clamping is applied to $y + k$ within $[0, H-1]$.

### 5.4 Complexity
$O(2 \cdot r \cdot N) = O(r \cdot N)$ where $r$ is the blur radius and $N$ is the number of pixels. This is linear with respect to the radius instead of quadratic.

---

## 6. Depth of Field — Background Blur

**File:** `_tools/blur.jsx`
**Type:** Edge Detection, Thresholding, and Image Compositing

### 6.1 What it does
Background Blur simulates a shallow depth-of-field effect by keeping foreground objects in sharp focus while blurring background areas. It runs entirely on the client side without AI/ML models.

### 6.2 Intuition & Procedure
In natural photographs, foreground subjects have sharp, high-contrast edges, whereas out-of-focus background regions contain mostly smooth transitions.
1. **Focus Map Generation:** Apply a Laplacian operator to measure high-frequency local changes (edges) in the image.
2. **Binarization:** Apply a threshold to separate sharp edge coordinates (foreground) from low-frequency flat coordinates (background).
3. **Mask Softening:** Feather the binary mask using a small spatial blur to smooth the transition boundaries.
4. **Compositing:** Create a fully blurred version of the image, then blend it with the original image using the feathered mask as an alpha channel.

### 6.3 The mathematics
1. **Laplacian Operator:** Convert the image to grayscale $Y(x,y) = 0.299R + 0.587G + 0.114B$. For each pixel, compute the absolute Laplacian value:
   $$L(x,y) = \left| 8Y(x,y) - \sum_{ky=-1}^{1} \sum_{kx=-1}^{1} Y(x+kx, y+ky) \right| \quad \text{for } (kx,ky) \neq (0,0)$$

2. **Binarized Mask:** For a given focus threshold $T$:
   $$M(x,y) = \begin{cases} 255 & \text{if } \frac{L(x,y)}{\max(L)} \times 255 \ge T \\ 0 & \text{otherwise} \end{cases}$$

3. **Feathered Mask ($W$):** Apply a fast box blur of radius $F$ to the binarized mask $M$:
   $$W(x,y) = \frac{1}{(2F+1)^2} \sum_{dy=-F}^{F} \sum_{dx=-F}^{F} M(x+dx, y+dy)$$

4. **Linear Composition:**
   $$I_{out}(x,y) = I(x,y) \cdot \left(\frac{W(x,y)}{255}\right) + I_{blur}(x,y) \cdot \left(1 - \frac{W(x,y)}{255}\right)$$
   where $I_{blur}$ is computed using `applyGaussianBlur(imageData, blurRadius)`.

### 6.4 Complexity
$O(r \cdot N)$ where $r$ is the blur radius and $N$ is the total pixel count. The focus map generation and mask compositing passes are both $O(N)$ operations.

---

## Summary comparison

| | Auto Enhance (Hist. Eq.) | Edge Detection (Sobel) | Threshold (Otsu) | K-Means (Color Segmentation) | Gaussian Blur | Background Blur |
|---|---|---|---|---|---|---|
| Family | Contrast enhancement | Edge detection | Segmentation | Machine Learning / Quantization | Low-pass spatial filtering | Defocus / Compositing |
| Works on | Global histogram | Local 3×3 neighbourhood | Global histogram | Global color vector space | 1D Separable Neighborhood | Local Laplacian + Gaussian |
| Core idea | CDF as a remap curve | Image gradient ∇I | Maximise between-class variance | Group RGB vectors by Euclidean distance | Separable Gaussian distribution | Identify sharp edges as foreground |
| Output | Re-toned colour image | White edges on black | Pure black & white | Segmented color image (K colors) | Smoothed / Blurred image | Defocused background image |
| Complexity | O(N + 256) | O(N) | O(N + 256) | O(I · K · S + K · N) | O(r · N) | O(r · N) |

## Implementation notes
- Each algorithm's pure functions are unit-tested in isolation (histogram sums, monotonic transfer LUT, zero edges on flat images, Otsu landing between clusters, K-Means convergence properties, 1D Gaussian kernel normalization, Laplacian absolute sum).
- Processed results are uploaded to ImageKit and the image source is set to the returned URL. This is deliberate: baking the result into the canvas as a base64 data URL would push the saved project past the backend's 1 MiB document limit. Storing a short URL keeps the saved state small.
- The pristine source is remembered on the image object (`originalSrc`) and serialized with the canvas, so **Reset** works even after saving and reloading the project.


