const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// ── Task data ──────────────────────────────────────────────────────────────
const tasks = [
    { name: '☑  EAS-1  Research & Planning', start: new Date('2025-11-01'), weeks: 4 },
    { name: '☑  EAS-2  System Design', start: new Date('2025-11-29'), weeks: 3 },
    { name: '☑  EAS-3  Frontend Development', start: new Date('2025-12-20'), weeks: 3 },
    { name: '☑  EAS-4  Backend Development', start: new Date('2026-01-10'), weeks: 4 },
    { name: '☑  EAS-5  Testing', start: new Date('2026-02-07'), weeks: 2 },
    { name: '☑  EAS-6  Implementation', start: new Date('2026-02-21'), weeks: 1 },
];

// ── Chart ranges ───────────────────────────────────────────────────────────
const rangeStart = new Date('2025-11-01');
const rangeEnd = new Date('2026-05-01');
const totalDays = (rangeEnd - rangeStart) / 86400000;

const months = [
    { label: 'Nov 2025', date: new Date('2025-11-01') },
    { label: 'Dec 2025', date: new Date('2025-12-01') },
    { label: 'Jan 2026', date: new Date('2026-01-01') },
    { label: 'Feb 2026', date: new Date('2026-02-01') },
    { label: 'Mar 2026', date: new Date('2026-03-01') },
    { label: 'Apr 2026', date: new Date('2026-04-01') },
];

// ── Canvas dimensions ──────────────────────────────────────────────────────
const W = 1200;
const H = 380;
const LEFT_PAD = 230;  // task name column
const TOP_PAD = 80;   // header
const BOT_PAD = 40;
const chartW = W - LEFT_PAD - 20;
const chartH = H - TOP_PAD - BOT_PAD;
const rowH = chartH / tasks.length;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// ── Background ─────────────────────────────────────────────────────────────
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, W, H);

// helper: day offset → x pixel
function dayToX(date) {
    const days = (date - rangeStart) / 86400000;
    return LEFT_PAD + (days / totalDays) * chartW;
}

// ── Alternating row shading ────────────────────────────────────────────────
tasks.forEach((_, i) => {
    const y = TOP_PAD + i * rowH;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f5f7fa';
    ctx.fillRect(LEFT_PAD, y, chartW, rowH);
});

// ── Vertical month dividers ────────────────────────────────────────────────
ctx.strokeStyle = '#d4d8de';
ctx.lineWidth = 1;
months.forEach(m => {
    const x = dayToX(m.date);
    ctx.beginPath();
    ctx.moveTo(x, TOP_PAD);
    ctx.lineTo(x, H - BOT_PAD);
    ctx.stroke();
});

// ── Horizontal row dividers ────────────────────────────────────────────────
for (let i = 0; i <= tasks.length; i++) {
    const y = TOP_PAD + i * rowH;
    ctx.beginPath();
    ctx.moveTo(LEFT_PAD, y);
    ctx.lineTo(W - 20, y);
    ctx.stroke();
}

// ── Header background ──────────────────────────────────────────────────────
ctx.fillStyle = '#edf0f5';
ctx.fillRect(0, 0, W, TOP_PAD);

// ── Header: vertical separator line at LEFT_PAD ───────────────────────────
ctx.strokeStyle = '#b8bec9';
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.moveTo(LEFT_PAD, 0);
ctx.lineTo(LEFT_PAD, H - BOT_PAD);
ctx.stroke();

// ── Header month labels ────────────────────────────────────────────────────
ctx.fillStyle = '#3a4a5c';
ctx.font = 'bold 13px Arial';
ctx.textAlign = 'center';

for (let i = 0; i < months.length; i++) {
    const mStart = months[i].date;
    const mEnd = i + 1 < months.length ? months[i + 1].date : rangeEnd;
    const xLeft = dayToX(mStart);
    const xRight = dayToX(mEnd);
    const xMid = (xLeft + xRight) / 2;

    ctx.fillStyle = '#3a4a5c';
    ctx.fillText(months[i].label, xMid, TOP_PAD - 10);

    // light vertical inside header
    if (i > 0) {
        ctx.strokeStyle = '#c8cdd8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xLeft, 10);
        ctx.lineTo(xLeft, TOP_PAD - 4);
        ctx.stroke();
    }
}

// ── Header "Items" label ───────────────────────────────────────────────────
ctx.fillStyle = '#3a4a5c';
ctx.font = 'bold 13px Arial';
ctx.textAlign = 'center';
ctx.fillText('Items', LEFT_PAD / 2, TOP_PAD - 10);

// ── Task name labels ───────────────────────────────────────────────────────
ctx.font = '12px Arial';
ctx.textAlign = 'left';
tasks.forEach((t, i) => {
    const y = TOP_PAD + i * rowH + rowH / 2 + 4;
    ctx.fillStyle = '#2c3e50';
    ctx.fillText(t.name, 12, y);
});

// ── Gantt bars ─────────────────────────────────────────────────────────────
const BAR_COLOR = '#5a7192';
const LABEL_COLOR = '#ffffff';
const BAR_RADIUS = 4;
const barPad = rowH * 0.22;

tasks.forEach((t, i) => {
    const endDate = new Date(t.start);
    endDate.setDate(endDate.getDate() + t.weeks * 7);

    const x = dayToX(t.start);
    const x2 = dayToX(endDate);
    const bW = x2 - x;
    const y = TOP_PAD + i * rowH + barPad;
    const bH = rowH - barPad * 2;

    // Rounded rectangle bar
    ctx.fillStyle = BAR_COLOR;
    ctx.beginPath();
    ctx.moveTo(x + BAR_RADIUS, y);
    ctx.lineTo(x + bW - BAR_RADIUS, y);
    ctx.quadraticCurveTo(x + bW, y, x + bW, y + BAR_RADIUS);
    ctx.lineTo(x + bW, y + bH - BAR_RADIUS);
    ctx.quadraticCurveTo(x + bW, y + bH, x + bW - BAR_RADIUS, y + bH);
    ctx.lineTo(x + BAR_RADIUS, y + bH);
    ctx.quadraticCurveTo(x, y + bH, x, y + bH - BAR_RADIUS);
    ctx.lineTo(x, y + BAR_RADIUS);
    ctx.quadraticCurveTo(x, y, x + BAR_RADIUS, y);
    ctx.closePath();
    ctx.fill();

    // Duration label
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${t.weeks}w`, x + bW / 2, y + bH / 2 + 4);
});

// ── Title ──────────────────────────────────────────────────────────────────
ctx.fillStyle = '#1a2535';
ctx.font = 'bold 15px Arial';
ctx.textAlign = 'left';
ctx.fillText('EasyEdit AI Photo Editor — Project Gantt Chart (Nov 2025 – Apr 2026)', 12, 24);

// ── Bottom border ──────────────────────────────────────────────────────────
ctx.strokeStyle = '#d4d8de';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(0, H - BOT_PAD);
ctx.lineTo(W, H - BOT_PAD);
ctx.stroke();

// ── Legend ─────────────────────────────────────────────────────────────────
const legendY = H - BOT_PAD + 12;
ctx.fillStyle = BAR_COLOR;
ctx.fillRect(LEFT_PAD, legendY, 16, 11);
ctx.fillStyle = '#555';
ctx.font = '11px Arial';
ctx.textAlign = 'left';
ctx.fillText('Project Phase  (bar width = duration)', LEFT_PAD + 22, legendY + 10);

// ── Save ───────────────────────────────────────────────────────────────────
const out = path.join('C:\\Users\\sauga\\OneDrive\\Desktop\\photo_editor', 'gantt_chart_final.png');
const buf = canvas.toBuffer('image/png');
fs.writeFileSync(out, buf);
console.log('Saved →', out);
