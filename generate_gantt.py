import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import matplotlib.dates as mdates
from datetime import datetime, timedelta
import numpy as np

# ── Task data ─────────────────────────────────────────────────────────────────
tasks = [
    ("EAS-1  Research & Planning",   datetime(2025, 11,  1), 28),
    ("EAS-2  System Design",         datetime(2025, 11, 29), 21),
    ("EAS-3  Frontend Development",  datetime(2025, 12, 20), 21),
    ("EAS-4  Backend Development",   datetime(2026,  1, 10), 28),
    ("EAS-5  Testing",               datetime(2026,  2,  7), 14),
    ("EAS-6  Implementation",        datetime(2026,  2, 21),  7),
]

# ── Figure setup ──────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(14, 5))
fig.patch.set_facecolor('white')
ax.set_facecolor('white')

bar_color  = '#5a7192'
grid_color = '#e0e3e8'
text_color = '#2c2c2c'
row_alt    = '#f7f8fa'

n = len(tasks)

# ── Alternating row backgrounds ───────────────────────────────────────────────
for i in range(n):
    if i % 2 == 1:
        ax.axhspan(i - 0.5, i + 0.5, color=row_alt, zorder=0)

# ── Draw bars ─────────────────────────────────────────────────────────────────
for i, (name, start, dur) in enumerate(tasks):
    end = start + timedelta(days=dur)
    ax.barh(
        i, (end - start).days, left=mdates.date2num(start),
        height=0.45, color=bar_color,
        align='center', zorder=3,
        linewidth=0
    )
    # Duration label inside bar
    mid = mdates.date2num(start) + (end - start).days / 2
    label = f"{dur // 7}w"
    ax.text(mid, i, label, ha='center', va='center',
            color='white', fontsize=8.5, fontweight='bold', zorder=4)

# ── X-axis: Nov 2025 – Apr 2026 ───────────────────────────────────────────────
x_start = datetime(2025, 11, 1)
x_end   = datetime(2026,  5, 1)
ax.set_xlim(mdates.date2num(x_start), mdates.date2num(x_end))

# Month major ticks
ax.xaxis.set_major_locator(mdates.MonthLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %Y'))
ax.xaxis.set_minor_locator(mdates.WeekdayLocator(byweekday=0))

plt.setp(ax.get_xticklabels(), rotation=0, ha='center',
         fontsize=9, color=text_color, fontweight='600')

# ── Y-axis: task names ────────────────────────────────────────────────────────
ax.set_yticks(range(n))
ax.set_yticklabels([t[0] for t in tasks], fontsize=9.5, color=text_color)
ax.set_ylim(-0.7, n - 0.3)
ax.invert_yaxis()

# ── Grid lines ────────────────────────────────────────────────────────────────
ax.xaxis.grid(True, which='major', color=grid_color, linewidth=1.2, zorder=1)
ax.xaxis.grid(True, which='minor', color=grid_color, linewidth=0.5,
              linestyle='--', zorder=1)
ax.yaxis.grid(True, color=grid_color, linewidth=0.8, zorder=1)

# ── Spines ────────────────────────────────────────────────────────────────────
for spine in ax.spines.values():
    spine.set_edgecolor(grid_color)

# ── Title ─────────────────────────────────────────────────────────────────────
ax.set_title('EasyEdit — Project Gantt Chart  (Nov 2025 – Apr 2026)',
             fontsize=13, fontweight='bold', color=text_color, pad=14)

# ── Top x-axis label (year grouping) ─────────────────────────────────────────
ax.tick_params(axis='x', which='both', top=False)
ax.tick_params(axis='y', which='both', left=False)

plt.tight_layout()
out = r'C:\Users\sauga\OneDrive\Desktop\photo_editor\gantt_chart_final.png'
plt.savefig(out, dpi=180, bbox_inches='tight', facecolor='white')
print(f"Saved → {out}")
