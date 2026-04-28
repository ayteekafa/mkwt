(function(){
  const root = window.MKWTReport = window.MKWTReport || {};

  function cssVar(name, fallback){
    try{
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    }catch(e){
      return fallback;
    }
  }

  function roundedRect(ctx, x, y, w, h, r){
    const radius = Math.min(r || 0, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillRound(ctx, x, y, w, h, r, fill, stroke){
    roundedRect(ctx, x, y, w, h, r);
    if(fill){
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if(stroke){
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function trimText(ctx, text, maxWidth){
    const value = String(text ?? "");
    if(ctx.measureText(value).width <= maxWidth) return value;
    let lo = 0;
    let hi = value.length;
    while(lo < hi){
      const mid = Math.ceil((lo + hi) / 2);
      if(ctx.measureText(value.slice(0, mid) + "...").width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return value.slice(0, lo) + "...";
  }

  function drawCardText(ctx, item, x, y, w, h, theme){
    const label = String(item.label || "").toUpperCase();
    const value = String(item.value ?? "-");
    const meta = String(item.meta || "");
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    ctx.font = "800 23px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.fillText(trimText(ctx, label, w - 28), x + 18, y + 16);

    ctx.font = "900 38px Arial, sans-serif";
    ctx.fillStyle = item.color || theme.text;
    ctx.fillText(trimText(ctx, value, w - 28), x + 18, y + 50);

    if(meta){
      ctx.font = "700 21px Arial, sans-serif";
      ctx.fillStyle = theme.muted;
      ctx.fillText(trimText(ctx, meta, w - 28), x + 18, y + h - 34);
    }
  }

  function drawTimeTrialStatCard(ctx, item, x, y, w, h, theme){
    const label = String(item.label || "").toUpperCase();
    const value = String(item.value ?? "-");
    const meta = String(item.meta || "");
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    ctx.font = "800 26px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.fillText(trimText(ctx, label, w - 34), x + 22, y + 16);

    ctx.font = "900 58px Arial, sans-serif";
    ctx.fillStyle = item.color || theme.text;
    ctx.fillText(trimText(ctx, value, w - 34), x + 22, y + 48);

    if(meta){
      ctx.font = "700 23px Arial, sans-serif";
      ctx.fillStyle = theme.muted;
      ctx.fillText(trimText(ctx, meta, w - 34), x + 22, y + h - 40);
    }
  }

  function drawContain(ctx, source, x, y, w, h){
    const sw = Number(source.width) || 1;
    const sh = Number(source.height) || 1;
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(source, dx, dy, dw, dh);
  }

  function asCanvas(item){
    if(!item) return null;
    if(item.canvas) return item.canvas;
    if(item.canvasId) return document.getElementById(item.canvasId);
    return null;
  }

  function safeFilename(name){
    return String(name || "mkwt-report.jpg")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .toLowerCase();
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function saveCanvas(canvas, opts){
    const filename = safeFilename(opts.filename || "mkwt-report.jpg");
    const type = opts.type || "image/jpeg";
    const quality = Number.isFinite(Number(opts.quality)) ? Number(opts.quality) : 0.86;
    await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if(!blob) reject(new Error("Image export failed."));
        else{
          downloadBlob(blob, filename);
          resolve();
        }
      }, type, quality);
    });
  }

  function drawReportTitle(ctx, opts, theme, width, margin){
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "900 52px Arial, sans-serif";
    ctx.fillStyle = theme.text;
    ctx.fillText(String(opts.title || "MKWT Report"), margin, margin);

    if(opts.subtitle){
      ctx.font = "700 24px Arial, sans-serif";
      ctx.fillStyle = theme.muted;
      ctx.fillText(trimText(ctx, opts.subtitle, width - margin * 2), margin, margin + 61);
    }
  }

  function drawChartPanel(ctx, item, x, y, w, h, theme){
    fillRound(ctx, x, y, w, h, 12, theme.card, theme.border);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "900 28px Arial, sans-serif";
    ctx.fillStyle = theme.text;
    ctx.fillText(trimText(ctx, item?.title || item?.canvasId || "Chart", w - 36), x + 18, y + 16);

    const ix = x + 18;
    const iy = y + 58;
    const iw = w - 36;
    const ih = h - 78;
    fillRound(ctx, ix, iy, iw, ih, 10, theme.card2, null);
    if(item?.canvas){
      drawContain(ctx, item.canvas, ix + 10, iy + 10, iw - 20, ih - 20);
    }else{
      ctx.font = "700 22px Arial, sans-serif";
      ctx.fillStyle = theme.muted;
      ctx.fillText("No chart data", ix + 22, iy + 22);
    }
  }

  function drawStatsPanel(ctx, stats, x, y, w, h, theme){
    fillRound(ctx, x, y, w, h, 12, theme.card, theme.border);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "900 28px Arial, sans-serif";
    ctx.fillStyle = theme.text;
    ctx.fillText("Stats", x + 18, y + 16);

    const cols = 3;
    const gap = 12;
    const pad = 18;
    const top = y + 58;
    const cardW = (w - pad * 2 - gap * (cols - 1)) / cols;
    const rows = Math.max(1, Math.ceil(stats.length / cols));
    const cardH = Math.max(112, (h - 74 - gap * (rows - 1)) / rows);
    stats.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cx = x + pad + col * (cardW + gap);
      const cy = top + row * (cardH + gap);
      fillRound(ctx, cx, cy, cardW, cardH, 10, theme.card2, theme.border);
      drawCardText(ctx, item, cx, cy, cardW, cardH, theme);
    });
  }

  function fallbackLetters(text){
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if(words.length >= 2) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
    return (words[0] || "?").slice(0, 2).toUpperCase();
  }

  function drawPill(ctx, x, y, w, h, text, fill, stroke, textColor){
    fillRound(ctx, x, y, w, h, h / 2, fill, stroke);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "800 16px Arial, sans-serif";
    ctx.fillStyle = textColor;
    ctx.fillText(trimText(ctx, text, w - 18), x + (w / 2), y + (h / 2) + 1);
  }

  function loadImageSource(src){
    return new Promise((resolve) => {
      if(!src){
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = new URL(src, window.location.href).toString();
    });
  }

  async function preloadImageMap(items){
    const sources = new Set();
    (items || []).forEach((item) => {
      [item.trackIconSrc, item.characterIconSrc, item.vehicleIconSrc].forEach((src) => {
        if(src) sources.add(src);
      });
    });
    const pairs = await Promise.all(Array.from(sources).map(async (src) => [src, await loadImageSource(src)]));
    return new Map(pairs);
  }

  function drawIconOrFallback(ctx, assets, src, label, x, y, size, theme){
    const img = src ? assets.get(src) : null;
    if(img){
      drawContain(ctx, img, x, y, size, size);
      return;
    }
    fillRound(ctx, x, y, size, size, 12, theme.card2, theme.border);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "900 20px Arial, sans-serif";
    ctx.fillStyle = theme.text;
    ctx.fillText(fallbackLetters(label), x + (size / 2), y + (size / 2) + 1);
  }

  function timeTrialBandAccent(key){
    if(key === "gold"){
      return {
        border: "rgba(223, 182, 88, 0.34)",
        glowA: "rgba(255,205,70,0.22)",
        glowB: "rgba(255,205,70,0.06)",
      };
    }
    if(key === "silver"){
      return {
        border: "rgba(207, 215, 229, 0.34)",
        glowA: "rgba(210,220,232,0.2)",
        glowB: "rgba(210,220,232,0.06)",
      };
    }
    if(key === "bronze"){
      return {
        border: "rgba(211, 158, 120, 0.34)",
        glowA: "rgba(205,128,70,0.18)",
        glowB: "rgba(205,128,70,0.05)",
      };
    }
    return {
      border: themeBorderFallback,
      glowA: null,
      glowB: null,
    };
  }

  let themeBorderFallback = "rgba(148,163,184,.22)";

  function drawTimeTrialEntryCard(ctx, item, x, y, w, h, theme, assets){
    const accent = timeTrialBandAccent(item.bandKey);
    const border = accent.border || theme.border;
    fillRound(ctx, x, y, w, h, 16, theme.card, border);

    ctx.save();
    roundedRect(ctx, x, y, w, h, 16);
    ctx.clip();

    const subtle = ctx.createLinearGradient(x, y, x, y + h);
    subtle.addColorStop(0, "rgba(255,255,255,0.045)");
    subtle.addColorStop(1, "rgba(255,255,255,0.015)");
    ctx.fillStyle = subtle;
    ctx.fillRect(x, y, w, h);

    const themeWash = ctx.createLinearGradient(x, y, x + Math.min(w * 0.52, 360), y + h);
    themeWash.addColorStop(0, "rgba(78,124,255,0.08)");
    themeWash.addColorStop(1, "rgba(78,124,255,0)");
    ctx.fillStyle = themeWash;
    ctx.fillRect(x, y, w, h);

    if(accent.glowA){
      const leftGlow = ctx.createLinearGradient(x, y, x + Math.min(w * 0.28, 240), y);
      leftGlow.addColorStop(0, accent.glowA);
      leftGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = leftGlow;
      ctx.fillRect(x, y, Math.min(w * 0.28, 240), h);
    }

    if(accent.glowB){
      const rim = ctx.createLinearGradient(x, y, x + 78, y);
      rim.addColorStop(0, accent.glowB);
      rim.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rim;
      ctx.fillRect(x, y, 78, h);
    }

    ctx.restore();

    const hero = w >= 820;
    const compact = w < 520;
    const pad = hero ? 28 : (compact ? 20 : 24);
    const iconSize = hero ? 146 : (compact ? 96 : 116);
    const comboIconSize = hero ? 122 : (compact ? 80 : 92);
    const comboGap = hero ? 20 : (compact ? 14 : 18);
    const comboTotalW = comboIconSize * 2 + comboGap;
    const comboBlockW = Math.max(hero ? 280 : (compact ? 182 : 206), comboTotalW + (hero ? 16 : 0));
    const trackBlockW = Math.max(hero ? 176 : (compact ? 122 : 138), iconSize);
    const sideGap = hero ? 28 : (compact ? 18 : 22);
    const timeBlockX = x + pad + trackBlockW + sideGap;
    const timeBlockW = Math.max(hero ? 270 : (compact ? 180 : 240), w - pad * 2 - trackBlockW - comboBlockW - sideGap * 2);
    const comboBlockX = x + w - pad - comboBlockW;
    const contentH = iconSize + (hero ? 56 : 44);
    const rowTop = y + Math.max(hero ? 34 : 24, Math.floor((h - contentH) / 2) - 8);

    if(hero){
      ctx.save();
      ctx.globalAlpha = 0.08;
      drawIconOrFallback(ctx, assets, item.trackIconSrc, item.trackName, x + 14, y + Math.floor((h - 190) / 2), 190, theme);
      ctx.restore();
    }

    drawIconOrFallback(ctx, assets, item.trackIconSrc, item.trackName, x + pad + ((trackBlockW - iconSize) / 2), rowTop, iconSize, theme);

    const pillText = item.categoryLabel || "-";
    ctx.font = hero ? "800 18px Arial, sans-serif" : (compact ? "800 15px Arial, sans-serif" : "800 16px Arial, sans-serif");
    const pillWidth = /shroomless/i.test(pillText)
      ? (hero ? 172 : 152)
      : Math.max(hero ? 112 : 96, Math.min(hero ? 142 : 126, ctx.measureText(pillText).width + 20));
    const pillFill = /shroomless/i.test(pillText) ? "rgba(124,198,255,0.11)" : "rgba(255,197,61,0.12)";
    const pillBorder = /shroomless/i.test(pillText) ? "rgba(124,198,255,0.30)" : "rgba(255,197,61,0.35)";
    const pillColor = /shroomless/i.test(pillText) ? "#8fd0ff" : "#ffd36f";
    drawPill(ctx, x + pad + ((trackBlockW - pillWidth) / 2), rowTop + iconSize + 12, pillWidth, hero ? 30 : 26, pillText, pillFill, pillBorder, pillColor);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = hero ? "900 66px Arial, sans-serif" : (compact ? "900 46px Arial, sans-serif" : "900 52px Arial, sans-serif");
    ctx.fillStyle = theme.text;
    ctx.fillText(String(item.timeText || "-"), timeBlockX + (timeBlockW / 2), rowTop + (hero ? 22 : 16));
    ctx.font = hero ? "800 22px Arial, sans-serif" : (compact ? "800 18px Arial, sans-serif" : "800 19px Arial, sans-serif");
    ctx.fillStyle = item.diffKind === "ahead" ? theme.good : (item.diffKind === "behind" ? theme.bad : theme.bad);
    ctx.fillText(`${String(item.diffText || "-")} to WR`, timeBlockX + (timeBlockW / 2), rowTop + (hero ? 116 : (compact ? 86 : 96)));

    const comboStartX = comboBlockX + ((comboBlockW - comboTotalW) / 2);
    const comboY = rowTop + Math.max(0, Math.floor((iconSize - comboIconSize) / 2)) + 2;
    drawIconOrFallback(ctx, assets, item.characterIconSrc, item.characterName, comboStartX, comboY, comboIconSize, theme);
    drawIconOrFallback(ctx, assets, item.vehicleIconSrc, item.vehicleName, comboStartX + comboIconSize + comboGap, comboY, comboIconSize, theme);
  }

  async function downloadTimeTrialProfile(opts, stats, entries, theme){
    const statCols = stats.length ? Math.min(2, Math.max(1, stats.length)) : 0;
    const statRows = statCols ? Math.ceil(stats.length / statCols) : 0;
    const statCardH = 142;
    const cols = entries.length <= 5 ? 1 : (entries.length <= 16 ? 2 : 3);
    const width = 1290;
    const height = 2796;
    const marginX = 54;
    const marginTop = 64;
    const marginBottom = 58;
    const gap = 16;
    const titleH = 116;
    const footerH = 40;
    const statsH = statRows ? (statRows * statCardH + Math.max(0, statRows - 1) * gap) : 0;
    const entriesTitleH = 42;
    const rows = Math.ceil(entries.length / cols);
    const contentW = cols === 1
      ? 920
      : cols === 2
        ? Math.min(1180, width - marginX * 2)
        : (width - marginX * 2);
    const contentX = Math.floor((width - contentW) / 2);
    const cardW = (contentW - gap * (cols - 1)) / cols;
    const entriesTopBase = marginTop + titleH + (statsH ? statsH + 10 : 0) + entriesTitleH;
    const entriesAreaH = height - entriesTopBase - footerH - marginBottom;
    const maxCardH = cols === 1 ? 430 : (cols === 2 ? 304 : 206);
    const minCardH = cols === 3 ? 154 : (cols === 2 ? 206 : 320);
    let cardH = Math.floor((entriesAreaH - Math.max(0, rows - 1) * gap) / Math.max(1, rows));
    cardH = Math.max(minCardH, Math.min(maxCardH, cardH));
    const entriesH = rows * cardH + Math.max(0, rows - 1) * gap;
    const entriesStartY = entriesTopBase + 8;
    const assets = await preloadImageMap(entries);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, theme.bg2 || theme.bg);
    bg.addColorStop(0.42, theme.bg);
    bg.addColorStop(1, theme.bg);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const bloomA = ctx.createRadialGradient(width * 0.2, height * 0.08, 0, width * 0.2, height * 0.08, width * 0.68);
    bloomA.addColorStop(0, "rgba(78,124,255,0.14)");
    bloomA.addColorStop(1, "rgba(78,124,255,0)");
    ctx.fillStyle = bloomA;
    ctx.fillRect(0, 0, width, height);

    const bloomB = ctx.createRadialGradient(width * 0.78, height * 0.2, 0, width * 0.78, height * 0.2, width * 0.58);
    bloomB.addColorStop(0, "rgba(255,255,255,0.04)");
    bloomB.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = bloomB;
    ctx.fillRect(0, 0, width, height);

    drawReportTitle(ctx, opts, theme, width, contentX);

    let y = marginTop + titleH;
    if(stats.length){
      const statW = (contentW - gap * (statCols - 1)) / statCols;
      stats.forEach((item, index) => {
        const col = index % statCols;
        const row = Math.floor(index / statCols);
        const sx = contentX + col * (statW + gap);
        const sy = y + row * (statCardH + gap);
        fillRound(ctx, sx, sy, statW, statCardH, 12, theme.card, theme.border);
        drawTimeTrialStatCard(ctx, item, sx, sy, statW, statCardH, theme);
      });
      y += statsH + 10;
    }

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "900 28px Arial, sans-serif";
    ctx.fillStyle = theme.text;
    ctx.fillText("Personal Bests", contentX, y);
    ctx.font = "700 18px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.fillText(`${entries.length} visible entries for the selected filter`, contentX, y + 30);

    entries.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const itemsInRow = Math.min(cols, entries.length - row * cols);
      const rowWidth = itemsInRow * cardW + Math.max(0, itemsInRow - 1) * gap;
      const rowStart = contentX + Math.max(0, (contentW - rowWidth) / 2);
      const x = rowStart + col * (cardW + gap);
      const cy = entriesStartY + row * (cardH + gap);
      drawTimeTrialEntryCard(ctx, item, x, cy, cardW, cardH, theme, assets);
    });

    ctx.font = "700 20px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "right";
    ctx.fillText(opts.footer || `Generated ${new Date().toLocaleString("en-US")}`, width - contentX, height - marginBottom + 8);

    await saveCanvas(canvas, opts);
  }

  async function downloadWorldWideQuad(opts, stats, charts, theme){
    const width = Math.max(2200, Number(opts.width) || 2500);
    const margin = 56;
    const gap = 26;
    const titleH = 92;
    const footerH = 44;
    const rowH = Number(opts.quadRowHeight) || 560;
    const panelW = (width - margin * 2 - gap) / 2;
    const height = margin + titleH + rowH + gap + rowH + footerH + margin;
    const chartByTitle = (title) => charts.find((item) => item.title === title || item.canvasId === title) || null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    drawReportTitle(ctx, opts, theme, width, margin);

    const top = margin + titleH;
    drawStatsPanel(ctx, stats, margin, top, panelW, rowH, theme);
    drawChartPanel(ctx, chartByTitle("Performance"), margin + panelW + gap, top, panelW, rowH, theme);
    drawChartPanel(ctx, chartByTitle("VR History"), margin, top + rowH + gap, panelW, rowH, theme);
    drawChartPanel(ctx, chartByTitle("Weekly VR"), margin + panelW + gap, top + rowH + gap, panelW, rowH, theme);

    ctx.font = "700 20px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "right";
    ctx.fillText(opts.footer || `Generated ${new Date().toLocaleString("en-US")}`, width - margin, height - margin + 8);

    await saveCanvas(canvas, opts);
  }

  root.downloadImage = async function(options){
    const opts = options || {};
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 60)));

    const theme = {
      bg: cssVar("--bg", "#07080a"),
      card: cssVar("--card", "#0c0f14"),
      card2: cssVar("--card-2", "#090c11"),
      border: cssVar("--border", "rgba(148,163,184,.22)"),
      text: cssVar("--text", "#ffffff"),
      muted: cssVar("--muted", "#9fb0c3"),
      primary: cssVar("--primary", "#4e7cff"),
      good: cssVar("--good", "#60d394"),
      bad: cssVar("--danger", "#ff6b6b"),
    };
    themeBorderFallback = theme.border;

    const stats = (opts.stats || []).filter((item) => item && (item.value !== undefined || item.meta || item.label));
    const charts = (opts.charts || [])
      .map((item) => ({ ...item, canvas: asCanvas(item) }))
      .filter((item) => item.canvas && item.canvas.width > 0 && item.canvas.height > 0);
    const entries = (opts.entries || []).filter(Boolean);

    if(!stats.length && !charts.length && !entries.length) throw new Error("No report data available.");

    if(opts.layout === "worldWideQuad"){
      await downloadWorldWideQuad(opts, stats, charts, theme);
      return;
    }

    if(opts.layout === "timeTrialProfile"){
      await downloadTimeTrialProfile(opts, stats, entries, theme);
      return;
    }

    const width = Math.max(1800, Number(opts.width) || 2400);
    const margin = 56;
    const gap = 26;
    const titleH = 92;
    const statCols = stats.length ? Math.min(6, Math.max(1, stats.length)) : 0;
    const statRows = statCols ? Math.ceil(stats.length / statCols) : 0;
    const statH = 126;
    const statsH = statRows ? statRows * statH + (statRows - 1) * 14 + 26 : 0;
    const requestedChartCols = Number(opts.columns);
    const chartCols = charts.length
      ? Math.min(charts.length, Math.max(1, Number.isFinite(requestedChartCols) ? requestedChartCols : (charts.length <= 3 ? charts.length : 3)))
      : 0;
    const chartRows = charts.length ? Math.ceil(charts.length / chartCols) : 0;
    const chartPanelH = opts.chartHeight || (chartCols >= 3 ? 455 : 520);
    const chartGridH = chartRows ? chartRows * chartPanelH + (chartRows - 1) * gap : 0;
    const footerH = 44;
    const height = Math.max(900, margin + titleH + statsH + chartGridH + footerH + margin);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    drawReportTitle(ctx, opts, theme, width, margin);

    let y = margin + titleH;
    if(stats.length){
      const cardW = (width - margin * 2 - gap * (statCols - 1)) / statCols;
      stats.forEach((item, index) => {
        const col = index % statCols;
        const row = Math.floor(index / statCols);
        const x = margin + col * (cardW + gap);
        const cy = y + row * (statH + 14);
        fillRound(ctx, x, cy, cardW, statH, 12, theme.card, theme.border);
        drawCardText(ctx, item, x, cy, cardW, statH, theme);
      });
      y += statsH;
    }

    if(charts.length){
      const panelW = (width - margin * 2 - gap * (chartCols - 1)) / chartCols;
      charts.forEach((item, index) => {
        const col = index % chartCols;
        const row = Math.floor(index / chartCols);
        const x = margin + col * (panelW + gap);
        const cy = y + row * (chartPanelH + gap);
        drawChartPanel(ctx, item, x, cy, panelW, chartPanelH, theme);
      });
      y += chartGridH;
    }

    ctx.font = "700 20px Arial, sans-serif";
    ctx.fillStyle = theme.muted;
    ctx.textAlign = "right";
    ctx.fillText(opts.footer || `Generated ${new Date().toLocaleString("en-US")}`, width - margin, height - margin + 8);

    await saveCanvas(canvas, opts);
  };
})();
