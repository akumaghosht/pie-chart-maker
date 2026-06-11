// SVG Chart Rendering Engine for 2D/3D Pie & Donut Charts

/**
 * Renders a Pie/Donut Chart inside an SVG element.
 * @param {SVGSVGElement} svg - The SVG DOM element.
 * @param {Array<{label: string, value: number, color: string}>} data - The dataset.
 * @param {Object} config - Configuration options.
 */
export function renderChart(svg, data, config) {
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
  const donutHole = isDonut ? Math.max(0.1, Math.min(0.8, config.donutHoleRadius ?? 0.5)) : 0;
  
  // 3D Parameters
  const tilt = is3D ? Math.max(0.2, Math.min(0.9, config.tilt ?? 0.55)) : 1.0;
  const height3D = is3D ? Math.max(0, Math.min(100, config.height3D ?? 30)) : 0;
  
  // Size & Center (Fixed landscape coordinates for responsive SVG scaling with built-in legend)
  const width = 520;
  const height = 360;
  
  const cx = 260;

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
  const availableChartHeight = height - legendAreaHeight;

  // If 3D, offset center slightly upwards to account for the extrusion height
  const cy = is3D ? (availableChartHeight - height3D) / 2 + 5 : availableChartHeight / 2;
  
  // Radius: make sure the chart fits within the container, leaving margin for labels & hover
  const margin = is3D ? 60 : 50;
  const extendRadiusX = 12;
  const extendRadiusY = 10;
  const elbowLength = 8;
  const fontSize = '9.5';

  const rx = Math.min(cx, cy) - margin;
  const ry = rx * tilt;

  // Setup SVG attributes
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  
  // Light angle for 3D shading (top-left light source: -135 degrees)
  const lightAngle = -135 * (Math.PI / 180);

  // Helper: Convert polar coordinates to Cartesian
  function polarToCartesian(centerX, centerY, radiusX, radiusY, angleInRadians) {
    return {
      x: centerX + radiusX * Math.cos(angleInRadians),
      y: centerY + radiusY * Math.sin(angleInRadians)
    };
  }

  // 1. Process slices and subdivide if any slice is larger than 120 degrees (to prevent painter's algorithm bugs)
  let startAngle = -Math.PI / 2; // Start at top (-90 deg)
  const renderSlices = [];

  validData.forEach((item, originalIndex) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    const percent = (item.value / total) * 100;

    // Mid angle of the entire original slice (used for unified hover offset direction)
    const originalMidAngle = startAngle + sliceAngle / 2;

    // Subdivide if slice is too big (max 120 deg per subsegment in 3D to prevent painter's algorithm bugs)
    // In 2D, we only subdivide when close to 360 deg to prevent SVG arc rendering issues
    const maxSubAngle = is3D ? 120 * (Math.PI / 180) : 350 * (Math.PI / 180);
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

  // Create group container
  const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(chartGroup);

  // Create a container for tooltips
  const tooltipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  tooltipGroup.setAttribute('pointer-events', 'none');
  svg.appendChild(tooltipGroup);

  // Keep track of slice group nodes for hover tracking
  const sliceNodes = [];

  // 3. Draw Slices
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

    // Draw Bottom Face (Only useful in 3D for translucent slices, but drawn for structural completeness)
    if (is3D) {
      // Bottom face path (usually hidden, but helps close geometry)
      const bottomPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let d = '';
      if (donutHole > 0) {
        const iStart = polarToCartesian(cx, cy + height3D, rx * donutHole, ry * donutHole, slice.start);
        const iEnd = polarToCartesian(cx, cy + height3D, rx * donutHole, ry * donutHole, slice.end);
        const pStartB = { x: pStart.x, y: pStart.y + height3D };
        const pEndB = { x: pEnd.x, y: pEnd.y + height3D };
        d = `M ${iStart.x} ${iStart.y} L ${pStartB.x} ${pStartB.y} A ${rx} ${ry} 0 ${largeArcFlag} 1 ${pEndB.x} ${pEndB.y} L ${iEnd.x} ${iEnd.y} A ${rx * donutHole} ${ry * donutHole} 0 ${largeArcFlag} 0 ${iStart.x} ${iStart.y} Z`;
      } else {
        d = `M ${cx} ${cy + height3D} L ${pStart.x} ${pStart.y + height3D} A ${rx} ${ry} 0 ${largeArcFlag} 1 ${pEnd.x} ${pEnd.y + height3D} Z`;
      }
      bottomPath.setAttribute('d', d);
      bottomPath.setAttribute('fill', slice.color);
      bottomPath.setAttribute('opacity', '0.45');
      sliceG.appendChild(bottomPath);
    }

    // Draw Outer Side Curved Wall (Visible in 3D)
    if (is3D) {
      const outerWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = `M ${pStart.x} ${pStart.y} 
                 A ${rx} ${ry} 0 ${largeArcFlag} 1 ${pEnd.x} ${pEnd.y} 
                 L ${pEnd.x} ${pEnd.y + height3D} 
                 A ${rx} ${ry} 0 ${largeArcFlag} 0 ${pStart.x} ${pStart.y + height3D} 
                 Z`;
      outerWall.setAttribute('d', d);
      outerWall.setAttribute('fill', slice.color);
      sliceG.appendChild(outerWall);

      // Shading overlay
      const outerShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      outerShade.setAttribute('d', d);
      outerShade.setAttribute('fill', 'black');
      // Calculate normal direction shadow (relative to light source)
      const shadowFactor = 0.12 + 0.38 * (1 - Math.cos(slice.mid - lightAngle));
      outerShade.setAttribute('opacity', shadowFactor.toFixed(3));
      sliceG.appendChild(outerShade);
    }

    // Draw Inner Side Curved Wall (Visible in 3D Donut)
    if (is3D && donutHole > 0) {
      const iStart = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.start);
      const iEnd = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.end);

      const innerWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      // Note the sweeps are reversed for the inner cylinder
      const d = `M ${iStart.x} ${iStart.y} 
                 A ${rx * donutHole} ${ry * donutHole} 0 ${largeArcFlag} 1 ${iEnd.x} ${iEnd.y} 
                 L ${iEnd.x} ${iEnd.y + height3D} 
                 A ${rx * donutHole} ${ry * donutHole} 0 ${largeArcFlag} 0 ${iStart.x} ${iStart.y + height3D} 
                 Z`;
      innerWall.setAttribute('d', d);
      innerWall.setAttribute('fill', slice.color);
      sliceG.appendChild(innerWall);

      // Shading overlay (internal shadow: light hits opposite face)
      const innerShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      innerShade.setAttribute('d', d);
      innerShade.setAttribute('fill', 'black');
      // Normal points inwards, so invert the light cosine direction
      const shadowFactor = 0.12 + 0.38 * (1 + Math.cos(slice.mid - lightAngle));
      innerShade.setAttribute('opacity', shadowFactor.toFixed(3));
      sliceG.appendChild(innerShade);
    }

    // Draw Radial Flat Walls (Visible in 3D at start/end cuts)
    if (is3D) {
      // Start Wall
      const startWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let dStart = '';
      if (donutHole > 0) {
        const iStart = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.start);
        dStart = `M ${iStart.x} ${iStart.y} L ${pStart.x} ${pStart.y} L ${pStart.x} ${pStart.y + height3D} L ${iStart.x} ${iStart.y + height3D} Z`;
      } else {
        dStart = `M ${cx} ${cy} L ${pStart.x} ${pStart.y} L ${pStart.x} ${pStart.y + height3D} L ${cx} ${cy + height3D} Z`;
      }
      startWall.setAttribute('d', dStart);
      startWall.setAttribute('fill', slice.color);
      sliceG.appendChild(startWall);

      // Shading on Start Wall
      const startShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      startShade.setAttribute('d', dStart);
      startShade.setAttribute('fill', 'black');
      // Shading based on normal of start cut (angle + Math.PI/2)
      const startNormal = slice.start + Math.PI / 2;
      const startShadow = 0.12 + 0.38 * (1 - Math.cos(startNormal - lightAngle));
      startShade.setAttribute('opacity', startShadow.toFixed(3));
      sliceG.appendChild(startShade);

      // End Wall
      const endWall = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let dEnd = '';
      if (donutHole > 0) {
        const iEnd = polarToCartesian(cx, cy, rx * donutHole, ry * donutHole, slice.end);
        dEnd = `M ${iEnd.x} ${iEnd.y} L ${pEnd.x} ${pEnd.y} L ${pEnd.x} ${pEnd.y + height3D} L ${iEnd.x} ${iEnd.y + height3D} Z`;
      } else {
        dEnd = `M ${cx} ${cy} L ${pEnd.x} ${pEnd.y} L ${pEnd.x} ${pEnd.y + height3D} L ${cx} ${cy + height3D} Z`;
      }
      endWall.setAttribute('d', dEnd);
      endWall.setAttribute('fill', slice.color);
      sliceG.appendChild(endWall);

      // Shading on End Wall
      const endShade = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      endShade.setAttribute('d', dEnd);
      endShade.setAttribute('fill', 'black');
      // Shading based on normal of end cut (angle - Math.PI/2)
      const endNormal = slice.end - Math.PI / 2;
      const endShadow = 0.12 + 0.38 * (1 - Math.cos(endNormal - lightAngle));
      endShade.setAttribute('opacity', endShadow.toFixed(3));
      sliceG.appendChild(endShade);
    }

    // Draw Top Face (Always visible, handles colors)
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
    // Add subtle top highlights for 3D depth
    if (is3D) {
      topFace.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
      topFace.setAttribute('stroke-width', '0.5');
    }
    sliceG.appendChild(topFace);

    // Append to group container
    chartGroup.appendChild(sliceG);
    sliceNodes.push(sliceG);
  });

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
    tooltipRect.setAttribute('fill', '#171717'); // Stark Vercel ink background
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
    tooltipTextName.setAttribute('fill', '#ffffff');
    tooltipTextName.setAttribute('font-family', 'var(--font-sans)');
    tooltipTextName.setAttribute('font-weight', '500');
    tooltipTextName.setAttribute('font-size', '12');
    tooltipTextName.textContent = label;

    // Text values
    tooltipTextVal = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tooltipTextVal.setAttribute('x', '24');
    tooltipTextVal.setAttribute('y', '38');
    tooltipTextVal.setAttribute('fill', '#a1a1a1');
    tooltipTextVal.setAttribute('font-family', 'var(--font-sans)');
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

  // Helper to dynamically truncate text to fit in SVG
  function truncateTextToWidth(textElement, label, percent, maxWidth) {
    const percentText = ` (${percent.toFixed(1)}%)`;
    const percentTextSolo = `${percent.toFixed(1)}%`;
    
    // 1. Try full text: "Label (XX.X%)"
    textElement.textContent = label + percentText;
    if (textElement.getComputedTextLength() <= maxWidth) {
      return;
    }

    // 2. Try truncated label with percentage: "Lab... (XX.X%)"
    let tempLabel = label;
    while (tempLabel.length > 0) {
      tempLabel = tempLabel.slice(0, -1);
      textElement.textContent = tempLabel + '...' + percentText;
      if (textElement.getComputedTextLength() <= maxWidth) {
        return;
      }
    }

    // 3. Try just the percentage: "XX.X%"
    textElement.textContent = percentTextSolo;
    if (textElement.getComputedTextLength() <= maxWidth) {
      return;
    }

    // 4. Hide if nothing fits
    textElement.textContent = '';
  }

  let currentStartAngle = -Math.PI / 2;
  validData.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    const midAngle = currentStartAngle + sliceAngle / 2;
    const percent = (item.value / total) * 100;

    // Only draw labels for slices that represent at least 1.5% of the total to prevent cluttered overlaps
    if (percent >= 1.5) {
      const pEdge = polarToCartesian(cx, cy, rx, ry, midAngle);
      
      // Determine elbow points using dynamic parameters
      const pOuter = polarToCartesian(cx, cy, rx + extendRadiusX, ry + extendRadiusY, midAngle);
      
      const isRightSide = Math.cos(midAngle) > 0;
      const lineEndX = pOuter.x + (isRightSide ? elbowLength : -elbowLength);

      // Create polyline pointer line
      const pointer = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pointer.setAttribute('points', `${pEdge.x},${pEdge.y} ${pOuter.x},${pOuter.y} ${lineEndX},${pOuter.y}`);
      pointer.setAttribute('stroke', '#a1a1a1'); // Hairline strong gray
      pointer.setAttribute('stroke-width', '1');
      pointer.setAttribute('fill', 'none');
      pointer.setAttribute('opacity', '0.55');
      labelGroup.appendChild(pointer);

      // Label Text element
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', (lineEndX + (isRightSide ? 4 : -4)).toString());
      text.setAttribute('y', (pOuter.y + 3.5).toString());
      text.setAttribute('fill', '#4d4d4d'); // Body gray for clean contrast
      text.setAttribute('font-family', 'var(--font-sans)');
      text.setAttribute('font-size', fontSize);
      text.setAttribute('font-weight', '500');
      text.setAttribute('text-anchor', isRightSide ? 'start' : 'end');
      
      labelGroup.appendChild(text);

      // Dynamically calculate maximum allowed text width (leaving safe 8px boundary)
      const maxWidth = isRightSide ? (width - 8 - (lineEndX + 4)) : (lineEndX - 4 - 8);
      truncateTextToWidth(text, item.label, percent, maxWidth);

      // Hide pointer line if the text is completely hidden
      if (text.textContent === '') {
        pointer.setAttribute('display', 'none');
      }
    }

    currentStartAngle += sliceAngle;
  });

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
    text.setAttribute('font-family', 'Inter, system-ui, -apple-system, sans-serif');
    text.setAttribute('font-size', '10.5');
    text.setAttribute('font-weight', '500');
    text.setAttribute('fill', '#4d4d4d');
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
}

function renderEmptyState(svg) {
  svg.setAttribute('viewBox', '0 0 400 300');
  
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', 'translate(200, 150)');
  g.setAttribute('text-anchor', 'middle');
  
  // Dotted placeholder circle
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('r', '75');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', '#ebebeb');
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('stroke-dasharray', '5,5');
  g.appendChild(circle);

  // Caption text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('y', '5');
  text.setAttribute('fill', '#888888');
  text.setAttribute('font-family', 'var(--font-sans)');
  text.setAttribute('font-size', '12');
  text.textContent = 'Enter data fields to render chart…';
  g.appendChild(text);

  svg.appendChild(g);
}
