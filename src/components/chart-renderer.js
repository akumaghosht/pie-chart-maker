// SVG Chart Rendering Engine for 2D/3D Pie & Donut Charts

/**
 * Renders a Pie/Donut Chart inside an SVG element.
 * @param {SVGSVGElement} svg - The SVG DOM element.
 * @param {Array<{label: string, value: number, color: string}>} data - The dataset.
 * @param {Object} config - Configuration options.
 */
function getCSSVar(el, name) {
  return getComputedStyle(el).getPropertyValue(name).trim() || "#171717";
}

export function renderChart(svg, data, config) {
  // Read CSS custom properties for dark mode compatibility
  const inkColor = getCSSVar(svg, "--cl-ink");
  const bodyColor = getCSSVar(svg, "--cl-body");
  const muteColor = getCSSVar(svg, "--cl-mute");
  const hairlineColor = getCSSVar(svg, "--cl-hairline");
  const hairlineStrong = getCSSVar(svg, "--cl-hairline-strong");
  const canvasColor = getCSSVar(svg, "--cl-canvas");
  const primaryColor = getCSSVar(svg, "--cl-primary");
  const onPrimaryColor = getCSSVar(svg, "--cl-on-primary");

  // Clear existing content
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Filter out invalid data
  const validData = data.filter(d => d && typeof d.value === 'number' && d.value > 0);
  const total = validData.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    renderEmptyState(svg);
    return;
  }

  // Configuration defaults
  const isDonut = !!config.isDonut;
  const is3D = !!config.is3D;
  const isWebGL3D = !!config.isWebGL3D;
  const donutHole = isDonut ? Math.max(0.1, Math.min(0.8, config.donutHoleRadius ?? 0.5)) : 0;
  
  // 3D Parameters
  const tilt = is3D ? Math.max(0.2, Math.min(0.9, config.tilt ?? 0.55)) : 1.0;
  const height3D = is3D ? Math.max(0, Math.min(100, config.height3D ?? 30)) : 0;
  
  // Size & Center (Fixed landscape coordinates for responsive SVG scaling with built-in legend)
  const width = 720;
  const height = 520;
  
  const cx = 360;

  // Dynamically calculate the space needed for the bottom legend
  const rowSpacing = validData.length > 10 ? 16 : 22;
  
  // Estimate total legend width to determine wrapping rows count
  let currentWordWidth = 0;
  let legendRowsCount = 1;
  validData.forEach((item) => {
    const itemWidth = 28 + item.label.length * 6.5;
    if (currentWordWidth + itemWidth > width - 40 && currentWordWidth > 0) {
      legendRowsCount++;
      currentWordWidth = itemWidth;
    } else {
      currentWordWidth += itemWidth;
    }
  });

  const legendAreaHeight = 15 + legendRowsCount * rowSpacing;
  
  // Calculate top offset dynamically for SVG Title & Subtitle
  let topOffset = 12;
  if (config.title) {
    topOffset += (config.titleFontSize || 15) + 10;
  }
  if (config.subtitle) {
    topOffset += (config.subtitleFontSize || 10.5) + 8;
  }

  // Radius & Placement parameters (calculated dynamically to prevent overlap with title and legend)
  const chartAreaTop = topOffset;
  const chartAreaBottom = height - legendAreaHeight;
  const availableChartHeight = chartAreaBottom - chartAreaTop;

  // Solve center Y coordinates
  // If 3D, offset center Y slightly upwards to account for the extrusion thickness
  const cy = chartAreaTop + (is3D ? (availableChartHeight - height3D) / 2 + 5 : availableChartHeight / 2);

  const extendRadiusX = 14;
  const extendRadiusY = 12;
  const elbowLength = 10;
  const fontSize = (config.labelFontSize || 9.5).toString();

  // Margins for labels & lines
  const verticalMargin = is3D ? 32 : 26; // 3D needs slightly more space for vertical extrusion rendering
  const horizontalMargin = 160; // safe margin for horizontal labels text

  // Calculate maximum allowed ry based on available vertical space and margins
  const ryMax = (availableChartHeight / 2) - (is3D ? height3D / 2 : 0) - verticalMargin;
  
  // Calculate maximum allowed rx based on width and horizontal margins
  const rxMax = cx - horizontalMargin;

  // Solve rx and ry: ry = rx * tilt, so rx = ry / tilt.
  // This guarantees neither rx exceeds rxMax, nor ry exceeds ryMax.
  const rx = Math.min(rxMax, ryMax / tilt);
  const ry = rx * tilt;

  // Setup SVG attributes
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // 0. Create defs block for fonts and background gradients
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);

  // Dynamic Google Font loading inside SVG for standalone exports
  if (config.fontFamily && config.fontFamily !== 'Inter' && config.fontFamily !== 'Geist' && config.fontFamily !== 'system-ui') {
    const fontStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    fontStyle.textContent = `@import url('https://fonts.googleapis.com/css2?family=${config.fontFamily.replace(/\s+/g, '+')}:wght@400;500;600;700&display=swap');`;
    defs.appendChild(fontStyle);
  }

  // 3D Lighting & Shadow Gradients inside SVG defs
  if (is3D) {
    const floorShadow = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    floorShadow.setAttribute('id', 'chart-3d-floor-shadow');
    floorShadow.setAttribute('cx', '50%');
    floorShadow.setAttribute('cy', '50%');
    floorShadow.setAttribute('r', '50%');
    
    const stop0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop0.setAttribute('offset', '0%');
    stop0.setAttribute('stop-color', '#000000');
    stop0.setAttribute('stop-opacity', '0.16');
    floorShadow.appendChild(stop0);

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '65%');
    stop1.setAttribute('stop-color', '#000000');
    stop1.setAttribute('stop-opacity', '0.05');
    floorShadow.appendChild(stop1);

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#000000');
    stop2.setAttribute('stop-opacity', '0');
    floorShadow.appendChild(stop2);

    defs.appendChild(floorShadow);

    const sideDepth = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    sideDepth.setAttribute('id', 'chart-3d-side-depth');
    sideDepth.setAttribute('x1', '0%');
    sideDepth.setAttribute('y1', '0%');
    sideDepth.setAttribute('x2', '0%');
    sideDepth.setAttribute('y2', '100%');

    const sStop0 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    sStop0.setAttribute('offset', '0%');
    sStop0.setAttribute('stop-color', '#ffffff');
    sStop0.setAttribute('stop-opacity', '0.12');
    sideDepth.appendChild(sStop0);

    const sStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    sStop1.setAttribute('offset', '100%');
    sStop1.setAttribute('stop-color', '#000000');
    sStop1.setAttribute('stop-opacity', '0.22');
    sideDepth.appendChild(sStop1);

    defs.appendChild(sideDepth);
  }

  // Draw background rect (skipped when rendering overlay over WebGL 3D canvas)
  if (!isWebGL3D) {
    const bg = config.backgroundColor !== undefined ? config.backgroundColor : '#ffffff';
    if (bg && bg.includes('linear-gradient')) {
      const matches = bg.match(/#[0-9a-fA-F]{3,8}/g);
      if (matches && matches.length >= 2) {
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', 'chart-bg-gradient');
        grad.setAttribute('x1', '0%');
        grad.setAttribute('y1', '0%');
        grad.setAttribute('x2', '100%');
        grad.setAttribute('y2', '100%');
        
        matches.forEach((color, i) => {
          const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
          const offset = i === 0 ? '0%' : i === matches.length - 1 ? '100%' : `${(i / (matches.length - 1)) * 100}%`;
          stop.setAttribute('offset', offset);
          stop.setAttribute('stop-color', color);
          grad.appendChild(stop);
        });
        defs.appendChild(grad);
        
        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', 'url(#chart-bg-gradient)');
        svg.appendChild(bgRect);
      }
    } else if (bg && bg !== 'transparent') {
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', '100%');
      bgRect.setAttribute('height', '100%');
      bgRect.setAttribute('fill', bg);
      svg.appendChild(bgRect);
    }
  }

  // Render Title & Subtitle inside SVG for exports & unified WYSIWYG
  const titleFontSize = config.titleFontSize || 15;
  const subtitleFontSize = config.subtitleFontSize || 10.5;

  if (config.title) {
    const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    titleText.setAttribute('x', cx.toString());
    titleText.setAttribute('y', '25');
    titleText.setAttribute('text-anchor', 'middle');
    titleText.setAttribute('fill', config.titleColor || inkColor);
    titleText.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
    titleText.setAttribute('font-size', titleFontSize.toString());
    titleText.setAttribute('font-weight', '600');
    titleText.textContent = config.title;
    svg.appendChild(titleText);
  }
  if (config.subtitle) {
    const subText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subText.setAttribute('x', cx.toString());
    subText.setAttribute('y', config.title ? (25 + titleFontSize + 3).toString() : '25');
    subText.setAttribute('text-anchor', 'middle');
    subText.setAttribute('fill', config.subtitleColor || muteColor);
    subText.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
    subText.setAttribute('font-size', subtitleFontSize.toString());
    subText.setAttribute('font-weight', '400');
    subText.textContent = config.subtitle;
    svg.appendChild(subText);
  }
  
  // Light angle for 3D shading (top-left key light source: -120 degrees)
  const lightAngle = -120 * (Math.PI / 180);

  // Helper: Convert polar coordinates to Cartesian
  function polarToCartesian(centerX, centerY, radiusX, radiusY, angleInRadians) {
    return {
      x: centerX + radiusX * Math.cos(angleInRadians),
      y: centerY + radiusY * Math.sin(angleInRadians)
    };
  }

  // Helper: Calculate visible outer intervals in [0, PI] (front half of cylinder)
  function getVisibleOuterIntervals(start, end) {
    let s = start;
    let e = end;
    while (s < 0) { s += 2 * Math.PI; e += 2 * Math.PI; }
    while (s >= 2 * Math.PI) { s -= 2 * Math.PI; e -= 2 * Math.PI; }
    
    const intervals = [];
    const oStart1 = Math.max(s, 0);
    const oEnd1 = Math.min(e, Math.PI);
    if (oEnd1 > oStart1) intervals.push([oStart1, oEnd1]);
    
    const oStart2 = Math.max(s, 2 * Math.PI);
    const oEnd2 = Math.min(e, 3 * Math.PI);
    if (oEnd2 > oStart2) intervals.push([oStart2 - 2 * Math.PI, oEnd2 - 2 * Math.PI]);
    
    return intervals;
  }

  // Helper: Calculate visible inner intervals in [PI, 2PI] (back half of donut hole)
  function getVisibleInnerIntervals(start, end) {
    let s = start;
    let e = end;
    while (s < 0) { s += 2 * Math.PI; e += 2 * Math.PI; }
    while (s >= 2 * Math.PI) { s -= 2 * Math.PI; e -= 2 * Math.PI; }
    
    const intervals = [];
    const oStart1 = Math.max(s, Math.PI);
    const oEnd1 = Math.min(e, 2 * Math.PI);
    if (oEnd1 > oStart1) intervals.push([oStart1, oEnd1]);
    
    const oStart2 = Math.max(s, 3 * Math.PI);
    const oEnd2 = Math.min(e, 4 * Math.PI);
    if (oEnd2 > oStart2) intervals.push([oStart2 - 2 * Math.PI, oEnd2 - 2 * Math.PI]);
    
    return intervals;
  }

  // 1. Process slices (subdivide only if >= 350 deg to prevent SVG 360-degree arc glitches)
  let startAngle = -Math.PI / 2; // Start at top (-90 deg)
  const renderSlices = [];

  validData.forEach((item, originalIndex) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    const percent = (item.value / total) * 100;

    // Mid angle of the entire original slice (used for unified hover offset direction)
    const originalMidAngle = startAngle + sliceAngle / 2;

    const maxSubAngle = 350 * (Math.PI / 180);
    const subSegmentsCount = Math.ceil(sliceAngle / maxSubAngle);
    
    for (let s = 0; s < subSegmentsCount; s++) {
      const subStart = startAngle + (sliceAngle / subSegmentsCount) * s;
      const subEnd = startAngle + (sliceAngle / subSegmentsCount) * (s + 1);
      const subMid = (subStart + subEnd) / 2;
      
      renderSlices.push({
        label: item.label,
        value: item.value,
        color: item.color,
        percent: percent,
        start: subStart,
        end: subEnd,
        mid: subMid,
        originalMidAngle: originalMidAngle,
        originalIndex: originalIndex,
        isFirstSub: s === 0,
        isLastSub: s === subSegmentsCount - 1
      });
    }

    startAngle = endAngle;
  });

  // 2. Sort slices for Painter's Algorithm (Back to Front)
  // Back slices (y is smaller, i.e. sin(mid) is closer to -1) must be rendered first.
  // Front slices (y is larger, i.e. sin(mid) is closer to 1) must be rendered last.
  if (is3D) {
    renderSlices.sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid));
  }

  // Soft Ambient Floor Shadow under 3D extruded chart to ground solid pieces (skipped when WebGL 3D renders)
  if (is3D && !isWebGL3D) {
    const shadowEllipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shadowEllipse.setAttribute('cx', cx.toString());
    shadowEllipse.setAttribute('cy', (cy + height3D + 6).toFixed(1));
    shadowEllipse.setAttribute('rx', (rx * 1.04).toFixed(1));
    shadowEllipse.setAttribute('ry', (ry * 0.95).toFixed(1));
    shadowEllipse.setAttribute('fill', 'url(#chart-3d-floor-shadow)');
    shadowEllipse.setAttribute('pointer-events', 'none');
    svg.appendChild(shadowEllipse);
  }

  // Create group container
  const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(chartGroup);

  // Create a container for tooltips
  const tooltipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  tooltipGroup.setAttribute('pointer-events', 'none');
  svg.appendChild(tooltipGroup);

  // Keep track of slice group nodes for hover tracking
  const sliceNodes = [];

  // 3. Draw Slices as Solid 3D Pieces (skipped when WebGL 3D handles rendering)
  if (!isWebGL3D) {
    renderSlices.forEach((slice, renderIndex) => {
      const sliceG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      sliceG.setAttribute('class', 'slice-group cursor-pointer transition-transform duration-200 ease-out');
      sliceG.dataset.index = slice.originalIndex;
      sliceG.dataset.renderIndex = renderIndex;
      sliceG.dataset.label = slice.label;
      sliceG.dataset.value = slice.value.toLocaleString();
      sliceG.dataset.percent = slice.percent.toFixed(1);
      sliceG.dataset.color = slice.color;
      
      // Calculate translation vector for hover effect (using original slice mid-angle so all segments translate together)
      const hoverOffsetEnabled = !config.disableHoverOffset;
      const hoverDist = hoverOffsetEnabled ? 12 : 0;
      const hx = hoverDist * Math.cos(slice.originalMidAngle);
      const hy = hoverDist * Math.sin(slice.originalMidAngle) * tilt;
      sliceG.dataset.hoverTransform = `translate(${hx}px, ${hy}px)`;

      const pStart = polarToCartesian(cx, cy, rx, ry, slice.start);
      const pEnd = polarToCartesian(cx, cy, rx, ry, slice.end);
      const largeArcFlag = (slice.end - slice.start) > Math.PI ? 1 : 0;

      // 1. Draw Outer Side Curved Wall (Only front-facing arcs [0, PI] to prevent hanging back-wall artifacts)
      if (is3D) {
        const visibleOuter = getVisibleOuterIntervals(slice.start, slice.end);
        visibleOuter.forEach(([arcStart, arcEnd]) => {
          const p1 = polarToCartesian(cx, cy, rx, ry, arcStart);
          const p2 = polarToCartesian(cx, cy, rx, ry, arcEnd);
          const arcLarge = (arcEnd - arcStart) > Math.PI ? 1 : 0;
          const arcMid = (arcStart + arcEnd) / 2;

          const dWall = `M ${p1.x} ${p1.y} 
                         A ${rx} ${ry} 0 ${arcLarge} 1 ${p2.x} ${p2.y} 
                         L ${p2.x} ${p2.y + height3D} 
                         A ${rx} ${ry} 0 ${arcLarge} 0 ${p1.x} ${p1.y + height3D} 
                         Z`;

          // Base solid body color
          const outerWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          outerWall.setAttribute('d', dWall);
          outerWall.setAttribute('fill', slice.color);
          sliceG.appendChild(outerWall);

          // Directional shading overlay (subtle, keeps rich solid slice color)
          const cosDiff = Math.cos(arcMid - lightAngle);
          const shadowFactor = 0.08 + 0.20 * (1 - cosDiff) / 2;
          const outerShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          outerShade.setAttribute('d', dWall);
          outerShade.setAttribute('fill', 'black');
          outerShade.setAttribute('opacity', shadowFactor.toFixed(3));
          sliceG.appendChild(outerShade);

          // Vertical cylindrical depth gradient
          const outerDepth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          outerDepth.setAttribute('d', dWall);
          outerDepth.setAttribute('fill', 'url(#chart-3d-side-depth)');
          sliceG.appendChild(outerDepth);

          // Subtle bottom contour edge to ground the slice rim
          const bottomEdge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          bottomEdge.setAttribute('d', `M ${p1.x} ${p1.y + height3D} A ${rx} ${ry} 0 ${arcLarge} 1 ${p2.x} ${p2.y + height3D}`);
          bottomEdge.setAttribute('fill', 'none');
          bottomEdge.setAttribute('stroke', 'rgba(0, 0, 0, 0.22)');
          bottomEdge.setAttribute('stroke-width', '0.75');
          sliceG.appendChild(bottomEdge);
        });
      }

      // 2. Draw Inner Side Curved Wall (Visible in 3D Donut hole [PI, 2PI])
      if (is3D && donutHole > 0) {
        const visibleInner = getVisibleInnerIntervals(slice.start, slice.end);
        visibleInner.forEach(([arcStart, arcEnd]) => {
          const i1 = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, arcStart);
          const i2 = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, arcEnd);
          const arcLarge = (arcEnd - arcStart) > Math.PI ? 1 : 0;
          const arcMid = (arcStart + arcEnd) / 2;

          const dInner = `M ${i1.x} ${i1.y} 
                          A ${rx * donutHole} ${ry * donutHole} 0 ${arcLarge} 1 ${i2.x} ${i2.y} 
                          L ${i2.x} ${i2.y + height3D} 
                          A ${rx * donutHole} ${ry * donutHole} 0 ${arcLarge} 0 ${i1.x} ${i1.y + height3D} 
                          Z`;

          const innerWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          innerWall.setAttribute('d', dInner);
          innerWall.setAttribute('fill', slice.color);
          sliceG.appendChild(innerWall);

          // Internal cavity shading
          const cosDiff = Math.cos(arcMid - lightAngle);
          const shadowFactor = 0.16 + 0.18 * (1 + cosDiff) / 2;
          const innerShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          innerShade.setAttribute('d', dInner);
          innerShade.setAttribute('fill', 'black');
          innerShade.setAttribute('opacity', shadowFactor.toFixed(3));
          sliceG.appendChild(innerShade);

          const innerDepth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          innerDepth.setAttribute('d', dInner);
          innerDepth.setAttribute('fill', 'url(#chart-3d-side-depth)');
          sliceG.appendChild(innerDepth);
        });
      }

      // 3. Draw Radial Flat Cut Walls (Only front-facing cuts so pieces look solid when popped or viewed from sides)
      if (is3D) {
        // Start Wall (Front-facing on left side: cos(start) < 0)
        if (slice.isFirstSub && Math.cos(slice.start) < -0.01) {
          let dStart = '';
          if (donutHole > 0) {
            const iStart = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.start);
            dStart = `M ${iStart.x} ${iStart.y} L ${pStart.x} ${pStart.y} L ${pStart.x} ${pStart.y + height3D} L ${iStart.x} ${iStart.y + height3D} Z`;
          } else {
            dStart = `M ${cx} ${cy} L ${pStart.x} ${pStart.y} L ${pStart.x} ${pStart.y + height3D} L ${cx} ${cy + height3D} Z`;
          }
          const startWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          startWall.setAttribute('d', dStart);
          startWall.setAttribute('fill', slice.color);
          sliceG.appendChild(startWall);

          const startNormal = slice.start - Math.PI / 2;
          const cosDiff = Math.cos(startNormal - lightAngle);
          const startShadow = 0.10 + 0.16 * (1 - cosDiff) / 2;
          const startShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          startShade.setAttribute('d', dStart);
          startShade.setAttribute('fill', 'black');
          startShade.setAttribute('opacity', startShadow.toFixed(3));
          sliceG.appendChild(startShade);

          const startDepth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          startDepth.setAttribute('d', dStart);
          startDepth.setAttribute('fill', 'url(#chart-3d-side-depth)');
          sliceG.appendChild(startDepth);
        }

        // End Wall (Front-facing on right side: cos(end) > 0)
        if (slice.isLastSub && Math.cos(slice.end) > 0.01) {
          let dEnd = '';
          if (donutHole > 0) {
            const iEnd = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.end);
            dEnd = `M ${iEnd.x} ${iEnd.y} L ${pEnd.x} ${pEnd.y} L ${pEnd.x} ${pEnd.y + height3D} L ${iEnd.x} ${iEnd.y + height3D} Z`;
          } else {
            dEnd = `M ${cx} ${cy} L ${pEnd.x} ${pEnd.y} L ${pEnd.x} ${pEnd.y + height3D} L ${cx} ${cy + height3D} Z`;
          }
          const endWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          endWall.setAttribute('d', dEnd);
          endWall.setAttribute('fill', slice.color);
          sliceG.appendChild(endWall);

          const endNormal = slice.end + Math.PI / 2;
          const cosDiff = Math.cos(endNormal - lightAngle);
          const endShadow = 0.14 + 0.18 * (1 - cosDiff) / 2;
          const endShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          endShade.setAttribute('d', dEnd);
          endShade.setAttribute('fill', 'black');
          endShade.setAttribute('opacity', endShadow.toFixed(3));
          sliceG.appendChild(endShade);

          const endDepth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          endDepth.setAttribute('d', dEnd);
          endDepth.setAttribute('fill', 'url(#chart-3d-side-depth)');
          sliceG.appendChild(endDepth);
        }
      }

      // 4. Draw Top Face (With crisp bevel stroke for defined, physical piece edges)
      const topFace = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let dTop = '';
      if (donutHole > 0) {
        const iStart = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.start);
        const iEnd = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.end);
        dTop = `M ${iStart.x} ${iStart.y} L ${pStart.x} ${pStart.y} A ${rx} ${ry} 0 ${largeArcFlag} 1 ${pEnd.x} ${pEnd.y} L ${iEnd.x} ${iEnd.y} A ${rx * donutHole} ${ry * donutHole} 0 ${largeArcFlag} 0 ${iStart.x} ${iStart.y} Z`;
      } else {
        dTop = `M ${cx} ${cy} L ${pStart.x} ${pStart.y} A ${rx} ${ry} 0 ${largeArcFlag} 1 ${pEnd.x} ${pEnd.y} Z`;
      }
      topFace.setAttribute('d', dTop);
      topFace.setAttribute('fill', slice.color);
      if (is3D) {
        topFace.setAttribute('stroke', 'rgba(255, 255, 255, 0.45)');
        topFace.setAttribute('stroke-width', '1');
        topFace.setAttribute('stroke-linejoin', 'round');
      }
      sliceG.appendChild(topFace);

      // Append to group container
      chartGroup.appendChild(sliceG);
      sliceNodes.push(sliceG);
    });
  }

  // 4. Interactive Event Observers (Hover Translate & Tooltip)
  let activeIndex = -1;

  // Build a lookup: originalIndex -> array of sub-nodes
  const nodesByIndex = {};
  sliceNodes.forEach((node) => {
    const idx = node.dataset.index;
    if (!nodesByIndex[idx]) nodesByIndex[idx] = [];
    nodesByIndex[idx].push(node);
  });

  function activateSlice(index, e) {
    if (activeIndex === index) return; // already active, nothing to do
    activeIndex = index;

    // Translate all sub-segments outward together
    sliceNodes.forEach((subNode) => {
      if (subNode.dataset.index === index) {
        subNode.style.transform = subNode.dataset.hoverTransform;
        // Bring to front by moving node to end of DOM parent
        chartGroup.appendChild(subNode);
      }
    });

    // Highlight corresponding element in the external legend if it exists
    const legendItem = document.querySelector(`.legend-item[data-index="${index}"]`);
    if (legendItem) {
      legendItem.classList.add('bg-canvas-soft-2', 'border-hairline-strong');
    }

    showTooltip(e, sliceNodes.find(n => n.dataset.index === index).dataset.label,
      sliceNodes.find(n => n.dataset.index === index).dataset.value,
      sliceNodes.find(n => n.dataset.index === index).dataset.percent,
      sliceNodes.find(n => n.dataset.index === index).dataset.color);
  }

  function deactivateSlice() {
    if (activeIndex === -1) return; // nothing active
    const index = activeIndex;
    activeIndex = -1;

    // Reset translation for all subsegments
    sliceNodes.forEach((subNode) => {
      if (subNode.dataset.index === index) {
        subNode.style.transform = 'none';
      }
    });

    const legendItem = document.querySelector(`.legend-item[data-index="${index}"]`);
    if (legendItem) {
      legendItem.classList.remove('bg-canvas-soft-2', 'border-hairline-strong');
    }

    hideTooltip();

    // Re-apply painter's sorting order to avoid depth bugs (3D)
    if (is3D) {
      sliceNodes.sort((a, b) => parseInt(a.dataset.renderIndex) - parseInt(b.dataset.renderIndex));
      sliceNodes.forEach((n) => chartGroup.appendChild(n));
    }
  }

  if (!isWebGL3D) {
    sliceNodes.forEach((node) => {
      node.addEventListener('mouseenter', (e) => {
        activateSlice(node.dataset.index, e);
      });

      node.addEventListener('mouseleave', (e) => {
        // Only deactivate if the cursor is moving to an element that is NOT
        // a sub-segment of the same logical slice. This prevents flicker when
        // the cursor moves between sub-segments of the same slice.
        const related = e.relatedTarget;
        const sameSliceNodes = nodesByIndex[node.dataset.index] || [];
        const isStillInSameSlice = related && sameSliceNodes.some(n => n === related || n.contains(related));
        if (!isStillInSameSlice) {
          deactivateSlice();
        }
      });

      node.addEventListener('mousemove', (e) => {
        updateTooltipPosition(e);
      });
    });

    // Safety net: if the cursor leaves the entire SVG element, always hide
    svg.addEventListener('mouseleave', () => {
      deactivateSlice();
    });
  }

  // Tooltip UI Drawing Functions
  let tooltipBg, tooltipTextName, tooltipTextVal, tooltipRect;

  function showTooltip(e, label, value, percent, color) {
    // Clear tooltip group
    while (tooltipGroup.firstChild) {
      tooltipGroup.removeChild(tooltipGroup.firstChild);
    }

    // Create container
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Background Rect
    tooltipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    tooltipRect.setAttribute('rx', '4');
    tooltipRect.setAttribute('fill', primaryColor);
    tooltipRect.setAttribute('filter', 'drop-shadow(0px 4px 8px rgba(0,0,0,0.15))');
    
    // Color Dot
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', color);
    dot.setAttribute('cx', '14');
    dot.setAttribute('cy', '18');

    // Text name
    tooltipTextName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tooltipTextName.setAttribute('x', '24');
    tooltipTextName.setAttribute('y', '22');
    tooltipTextName.setAttribute('fill', onPrimaryColor);
    tooltipTextName.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
    tooltipTextName.setAttribute('font-weight', '500');
    tooltipTextName.setAttribute('font-size', '12');
    tooltipTextName.textContent = label;

    // Text values
    tooltipTextVal = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tooltipTextVal.setAttribute('x', '24');
    tooltipTextVal.setAttribute('y', '38');
    tooltipTextVal.setAttribute('fill', hairlineStrong);
    tooltipTextVal.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
    tooltipTextVal.setAttribute('font-size', '11');
    tooltipTextVal.textContent = `${value} (${percent}%)`;

    g.appendChild(tooltipRect);
    g.appendChild(dot);
    g.appendChild(tooltipTextName);
    g.appendChild(tooltipTextVal);
    
    tooltipGroup.appendChild(g);
    tooltipGroup.setAttribute('opacity', '1');

    // Calculate dimensions
    const bboxName = tooltipTextName.getBBox();
    const bboxVal = tooltipTextVal.getBBox();
    const textWidth = Math.max(bboxName.width, bboxVal.width);
    
    const rectWidth = textWidth + 36;
    const rectHeight = 50;
    
    tooltipRect.setAttribute('width', rectWidth.toString());
    tooltipRect.setAttribute('height', rectHeight.toString());
    
    updateTooltipPosition(e);
  }

  function updateTooltipPosition(e) {
    if (!tooltipRect) return;
    
    const svgRect = svg.getBoundingClientRect();
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;
    
    const rectWidth = parseFloat(tooltipRect.getAttribute('width'));
    const rectHeight = parseFloat(tooltipRect.getAttribute('height'));
    
    // Offset above the cursor
    let tx = x - rectWidth / 2;
    let ty = y - rectHeight - 14;
    
    // Boundary checks
    if (tx < 5) tx = 5;
    if (tx + rectWidth > width - 5) tx = width - rectWidth - 5;
    if (ty < 5) ty = y + 20; // Show below if too close to top
    
    tooltipGroup.setAttribute('transform', `translate(${tx}, ${ty})`);
  }

  function hideTooltip() {
    tooltipGroup.setAttribute('opacity', '0');
  }

  // 5. Draw Static Labels and Pointer Lines (drawn in a separate overlay group on top)
  const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  labelGroup.setAttribute('class', 'static-labels select-none pointer-events-none');
  svg.appendChild(labelGroup);

  // Helper to format text according to chosen labelMode
  function formatLabelText(label, value, percent, mode) {
    switch (mode) {
      case 'label-percent':
        return `${label} (${percent.toFixed(1)}%)`;
      case 'label-value':
        return `${label} (${value.toLocaleString()})`;
      case 'label-value-percent':
        return `${label} (${value.toLocaleString()}, ${percent.toFixed(1)}%)`;
      case 'label':
        return label;
      case 'value':
        return value.toLocaleString();
      case 'percent':
        return `${percent.toFixed(1)}%`;
      case 'none':
      default:
        return '';
    }
  }

  // Helper to dynamically truncate text to fit in SVG
  function truncateTextToWidth(textElement, label, value, percent, maxWidth, mode) {
    if (mode === 'none') {
      textElement.textContent = '';
      return;
    }

    // 1. Try full text
    const fullText = formatLabelText(label, value, percent, mode);
    textElement.textContent = fullText;
    if (textElement.getComputedTextLength() <= maxWidth) {
      return;
    }

    // 2. Try truncated label with suffix if mode contains label
    if (mode === 'label-percent' || mode === 'label-value' || mode === 'label-value-percent' || mode === 'label') {
      let tempLabel = label;
      const suffix = mode === 'label-percent' ? ` (${percent.toFixed(1)}%)` : 
                     mode === 'label-value' ? ` (${value.toLocaleString()})` : 
                     mode === 'label-value-percent' ? ` (${value.toLocaleString()}, ${percent.toFixed(1)}%)` : '';
      
      while (tempLabel.length > 0) {
        tempLabel = tempLabel.slice(0, -1);
        textElement.textContent = tempLabel + '...' + suffix;
        if (textElement.getComputedTextLength() <= maxWidth) {
          return;
        }
      }
      
      // Fallback: if label + suffix doesn't fit, try just value or percent
      if (mode === 'label-percent' || mode === 'label-value-percent') {
        textElement.textContent = `${percent.toFixed(1)}%`;
        if (textElement.getComputedTextLength() <= maxWidth) return;
      } else if (mode === 'label-value') {
        textElement.textContent = value.toLocaleString();
        if (textElement.getComputedTextLength() <= maxWidth) return;
      }
    }

    // 4. Hide if nothing fits
    textElement.textContent = '';
  }

  let currentStartAngle = -Math.PI / 2;
  const labelMode = config.labelMode || 'label-percent';

  // In WebGL 3D mode, static labels are skipped here because dynamic 3D-projected labels
  // are rendered and animated in real-time by chart-renderer-3d.js to move with the slices.
  if (labelMode !== 'none' && !isWebGL3D) {
    validData.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      const midAngle = currentStartAngle + sliceAngle / 2;
      const percent = (item.value / total) * 100;

      // Only draw labels for slices that represent at least 1.5% of the total to prevent cluttered overlaps
      if (percent >= 1.5) {
        const pEdge = polarToCartesian(cx, cy, rx, ry, midAngle);
        
        // In 3D, dynamically extend front-facing labels downwards so pointer lines do not collide with 3D side walls
        const frontFactor = is3D ? Math.max(0, Math.sin(midAngle)) : 0;
        const dynamicExtendY = extendRadiusY + (is3D ? height3D * frontFactor * 0.8 : 0);
        
        // Determine elbow points using dynamic parameters
        const pOuter = polarToCartesian(cx, cy, rx + extendRadiusX, ry + dynamicExtendY, midAngle);
        
        const isRightSide = Math.cos(midAngle) > 0;
        const lineEndX = pOuter.x + (isRightSide ? elbowLength : -elbowLength);

        // Create polyline pointer line
        const pointer = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        pointer.setAttribute('points', `${pEdge.x},${pEdge.y} ${pOuter.x},${pOuter.y} ${lineEndX},${pOuter.y}`);
        pointer.setAttribute('stroke', hairlineStrong);
        pointer.setAttribute('stroke-width', '1');
        pointer.setAttribute('fill', 'none');
        pointer.setAttribute('opacity', '0.55');
        labelGroup.appendChild(pointer);

        // Label Text element
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (lineEndX + (isRightSide ? 4 : -4)).toString());
        text.setAttribute('y', (pOuter.y + 3.5).toString());
        text.setAttribute('fill', config.labelColor || bodyColor);
        text.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
        text.setAttribute('font-size', fontSize);
        text.setAttribute('font-weight', '500');
        text.setAttribute('text-anchor', isRightSide ? 'start' : 'end');
        
        labelGroup.appendChild(text);

        // Dynamically calculate maximum allowed text width (leaving safe 8px boundary)
        const maxWidth = isRightSide ? (width - 8 - (lineEndX + 4)) : (lineEndX - 4 - 8);
        truncateTextToWidth(text, item.label, item.value, percent, maxWidth, labelMode);

        // Hide pointer line if the text is completely hidden
        if (text.textContent === '') {
          pointer.setAttribute('display', 'none');
        }
      }

      currentStartAngle += sliceAngle;
    });
  }

  // 6. Draw Legend at the Bottom horizontally centered (without headers or numbering)
  const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  legendGroup.setAttribute('class', 'svg-legend select-none');
  svg.appendChild(legendGroup);

  // Calculate widths of legend items to center them
  const itemsData = validData.map((item) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', item.color);
    g.appendChild(dot);
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
    text.setAttribute('font-size', '10.5');
    text.setAttribute('font-weight', '500');
    text.setAttribute('fill', config.labelColor || bodyColor);
    text.textContent = item.label;
    g.appendChild(text);
    
    legendGroup.appendChild(g);
    
    // Measure text length (with dynamic fallback if client rect is unavailable)
    let textLen = text.getComputedTextLength();
    if (textLen === 0) {
      textLen = item.label.length * 6.5;
    }
    
    // Total width: dot gap (8) + dot diameter (8) + text spacing (12) + text width + item spacing (18)
    const itemWidth = 28 + textLen;
    
    return { g, dot, text, width: itemWidth };
  });

  // Arrange items horizontally, wrap to a new line if they exceed width
  const maxLegendWidth = width - 40; // 480px
  const rows = [[]];
  
  itemsData.forEach((item) => {
    const currentRow = rows[rows.length - 1];
    const rowWidth = currentRow.reduce((sum, i) => sum + i.width, 0);
    
    if (rowWidth + item.width > maxLegendWidth && currentRow.length > 0) {
      rows.push([item]);
    } else {
      currentRow.push(item);
    }
  });

  // Position elements vertically centered within the bottom legend area
  const rowHeight = rowSpacing;
  const startY = height - legendAreaHeight + 20;
  
  rows.forEach((row, rowIndex) => {
    const rowY = startY + rowIndex * rowHeight;
    const totalRowWidth = row.reduce((sum, i) => sum + i.width, 0) - 18; // subtract last item spacing
    const rowStartX = (width - totalRowWidth) / 2;
    
    let xOffset = rowStartX;
    row.forEach((item) => {
      item.g.setAttribute('transform', `translate(${xOffset}, ${rowY})`);
      item.dot.setAttribute('cx', '4');
      item.dot.setAttribute('cy', '-3');
      item.text.setAttribute('x', '14');
      item.text.setAttribute('y', '0');
      xOffset += item.width;
    });
  });

  // 7. Draw Source Citation at bottom-right corner of SVG if provided
  if (config.source) {
    const srcText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    srcText.setAttribute('x', (width - 20).toString()); // bottom-right with margin
    srcText.setAttribute('y', (height - 6).toString());
    srcText.setAttribute('text-anchor', 'end');
    srcText.setAttribute('fill', config.sourceColor || muteColor);
    srcText.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
    srcText.setAttribute('font-size', (config.sourceFontSize || 8).toString());
    srcText.setAttribute('font-weight', '400');
    srcText.textContent = config.source.startsWith('Source:') ? config.source : `Source: ${config.source}`;
    svg.appendChild(srcText);
  }
}

function renderEmptyState(svg) {
  const inkColor = getCSSVar(svg, "--cl-ink");
  const muteColor = getCSSVar(svg, "--cl-mute");
  const hairlineColor = getCSSVar(svg, "--cl-hairline");

  svg.setAttribute('viewBox', '0 0 400 300');
  
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', 'translate(200, 150)');
  g.setAttribute('text-anchor', 'middle');
  
  // Dotted placeholder circle
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('r', '75');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', hairlineColor);
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('stroke-dasharray', '5,5');
  g.appendChild(circle);

  // Caption text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('y', '5');
  text.setAttribute('fill', muteColor);
  text.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
  text.setAttribute('font-size', '12');
  text.textContent = 'Enter data fields to render chart…';
  g.appendChild(text);

  svg.appendChild(g);
}
