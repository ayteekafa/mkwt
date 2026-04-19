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
    };

    const stats = (opts.stats || []).filter((item) => item && (item.value !== undefined || item.meta || item.label));
    const charts = (opts.charts || [])
      .map((item) => ({ ...item, canvas: asCanvas(item) }))
      .filter((item) => item.canvas && item.canvas.width > 0 && item.canvas.height > 0);

    if(!stats.length && !charts.length) throw new Error("No report data available.");

    if(opts.layout === "worldWideQuad"){
      await downloadWorldWideQuad(opts, stats, charts, theme);
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
