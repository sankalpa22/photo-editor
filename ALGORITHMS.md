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

## Summary comparison

| | Auto Enhance (Hist. Eq.) | Edge Detection (Sobel) | Threshold (Otsu) |
|---|---|---|---|
| Family | Contrast enhancement | Edge detection | Segmentation |
| Works on | Global histogram | Local 3×3 neighbourhood | Global histogram |
| Core idea | CDF as a remap curve | Image gradient ∇I | Maximise between-class variance |
| Output | Re-toned colour image | White edges on black | Pure black & white |
| Complexity | O(N + 256) | O(N) | O(N + 256) |

## Implementation notes
- Each algorithm's pure functions are unit-tested in isolation (histogram sums,
  monotonic transfer LUT, zero edges on flat images, Otsu landing between
  clusters, etc.).
- Processed results are uploaded to ImageKit and the image source is set to the
  returned URL. This is deliberate: baking the result into the canvas as a
  base64 data URL would push the saved project past the backend's 1 MiB
  document limit. Storing a short URL keeps the saved state small.
- The pristine source is remembered on the image object (`originalSrc`) and
  serialized with the canvas, so **Reset** works even after saving and
  reloading the project.
