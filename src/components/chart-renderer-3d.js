// Interactive Three.js 3D Pie & Donut Chart Renderer
// Delivers a high-performance, watertight WebGL 3D experience with OrbitControls
// and real-time screen-projected callout labels that move with the slices

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// SVG ViewBox coordinate dimensions (shared with chart-renderer.js)
export const SVG_VIEW_WIDTH = 720;
export const SVG_VIEW_HEIGHT = 520;

/**
 * Creates a soft radial shadow texture using an offscreen canvas.
 */
function createShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.12)');
  grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.03)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Creates a solid extruded 3D slice geometry using THREE.ExtrudeGeometry.
 * Guarantees 100% watertight solids with correct face normals and zero gaps.
 */
function createSliceGeometry(startAngle, endAngle, outerRadius, innerRadius, height, sliceGap) {
  const sliceAngle = endAngle - startAngle;
  const isFullCircle = sliceAngle >= Math.PI * 2 - 0.001;
  
  const shape = new THREE.Shape();
  
  if (isFullCircle) {
    // Full 360-degree circle
    shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
    if (innerRadius > 0.001) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  } else {
    const maxGap = sliceAngle * 0.1;
    const gap = sliceAngle > 0.08 ? Math.min(sliceGap, maxGap) : 0;
    
    const adjStart = startAngle + gap;
    const adjEnd = endAngle - gap;
    
    if (innerRadius > 0.001) {
      // Donut slice:
      // 1. Start at outer radius at adjStart
      shape.moveTo(Math.cos(adjStart) * outerRadius, Math.sin(adjStart) * outerRadius);
      // 2. Arc along outer radius to adjEnd
      shape.absarc(0, 0, outerRadius, adjStart, adjEnd, false);
      // 3. Line inward to inner radius at adjEnd
      shape.lineTo(Math.cos(adjEnd) * innerRadius, Math.sin(adjEnd) * innerRadius);
      // 4. Arc along inner radius back to adjStart (clockwise)
      shape.absarc(0, 0, innerRadius, adjEnd, adjStart, true);
      // 5. Close path back to start
      shape.closePath();
    } else {
      // Pie slice:
      // 1. Start at center (0, 0)
      shape.moveTo(0, 0);
      // 2. Straight line out to outer rim at adjStart
      shape.lineTo(Math.cos(adjStart) * outerRadius, Math.sin(adjStart) * outerRadius);
      // 3. Curved arc along rim from adjStart to adjEnd
      shape.absarc(0, 0, outerRadius, adjStart, adjEnd, false);
      // 4. Straight line back into center (0, 0)
      shape.lineTo(0, 0);
      // 5. Close path at (0, 0)
      shape.closePath();
    }
  }
  
  const extrudeSettings = {
    depth: height,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 64,
  };
  
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Center along extrusion axis
  geom.translate(0, 0, -height / 2);
  // Rotate so extrusion depth (Z) maps to vertical height (Y), and Shape Y maps to Z
  geom.rotateX(Math.PI / 2);
  geom.computeVertexNormals();
  
  return geom;
}

/**
 * Formats label text according to chosen labelMode.
 */
function formatAndTruncateLabel(textEl, label, value, percent, maxWidth, mode) {
  if (mode === 'none') {
    textEl.textContent = '';
    return;
  }
  let textStr = '';
  switch (mode) {
    case 'label-percent':
      textStr = `${label} (${percent.toFixed(1)}%)`;
      break;
    case 'label-value':
      textStr = `${label} (${value.toLocaleString()})`;
      break;
    case 'label-value-percent':
      textStr = `${label} (${value.toLocaleString()}, ${percent.toFixed(1)}%)`;
      break;
    case 'label':
      textStr = label;
      break;
    case 'value':
      textStr = value.toLocaleString();
      break;
    case 'percent':
      textStr = `${percent.toFixed(1)}%`;
      break;
    default:
      textStr = `${label} (${percent.toFixed(1)}%)`;
  }

  textEl.textContent = textStr;

  // Truncate if too long to prevent overflowing SVG viewbox
  try {
    if (textEl.getComputedTextLength && textEl.getComputedTextLength() > maxWidth && maxWidth > 30) {
      const suffix = mode === 'label-percent' ? ` (${percent.toFixed(1)}%)` : 
                     mode === 'label-value' ? ` (${value.toLocaleString()})` : 
                     mode === 'label-value-percent' ? ` (${value.toLocaleString()}, ${percent.toFixed(1)}%)` : '';
      let temp = label;
      while (temp.length > 2) {
        temp = temp.slice(0, -1);
        textEl.textContent = temp + '...' + suffix;
        if (textEl.getComputedTextLength() <= maxWidth) return;
      }

      // Fallback: if label + suffix doesn't fit, try just value or percent
      if (mode === 'label-percent' || mode === 'label-value-percent') {
        textEl.textContent = `${percent.toFixed(1)}%`;
        if (textEl.getComputedTextLength() <= maxWidth) return;
      } else if (mode === 'label-value') {
        textEl.textContent = value.toLocaleString();
        if (textEl.getComputedTextLength() <= maxWidth) return;
      }
    }
  } catch (e) {
    // Graceful fallback if getComputedTextLength fails in non-rendered context
  }
}

/**
 * Renders an interactive 3D pie/donut chart using Three.js with dynamic projected callout labels.
 * 
 * @param {HTMLElement} container - DOM container element for WebGL canvas.
 * @param {Array<{label: string, value: number, color: string}>} initialData - Chart data.
 * @param {Object} initialConfig - Chart config.
 * @param {SVGSVGElement} [svgOverlay] - The SVG overlay element to attach dynamic labels to.
 */
export function render3DChart(container, initialData, initialConfig, svgOverlay) {
  // Clear any existing contents inside container
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const width = container.clientWidth || 480;
  const height = container.clientHeight || 333;
  
  // --- 1. Scene, Camera, Renderer ---
  const scene = new THREE.Scene();
  
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.5, 50);
  
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true, // Needed for PNG/PDF export
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.cursor = 'grab';
  container.appendChild(canvas);
  
  // --- 2. Studio Lighting Setup ---
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x333344, 0.7);
  scene.add(hemiLight);
  
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(-3.5, 6, 4);
  scene.add(keyLight);
  
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
  fillLight.position.set(4, 3, -1.5);
  scene.add(fillLight);
  
  const rimLight = new THREE.DirectionalLight(0xedf2ff, 0.35);
  rimLight.position.set(0, 1.5, -4.5);
  scene.add(rimLight);
  
  // --- 3. Ground Shadow Plane ---
  const shadowTexture = createShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  scene.add(shadowMesh);
  
  // --- 4. Chart Content Group ---
  const chartGroup = new THREE.Group();
  scene.add(chartGroup);
  
  // --- 5. OrbitControls ---
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.enableZoom = true;
  controls.minDistance = 3.2;
  controls.maxDistance = 10;
  controls.enablePan = false; // Keep chart centered
  controls.minPolarAngle = Math.PI * 0.08; // Almost top-down
  controls.maxPolarAngle = Math.PI * 0.48; // Don't go below floor
  
  // Looking slightly below origin (TARGET_Y) shifts the 3D pie higher up on screen,
  // creating generous vertical separation so the extruded front rim never overlaps the bottom legend.
  const TARGET_Y = -0.22;
  controls.target.set(0, TARGET_Y, 0);
  
  function applyDefaultCamera(tiltValue) {
    const tilt = Math.max(0.2, Math.min(0.9, tiltValue ?? 0.55));
    const dist = 7.1;
    // Map tilt: lower tilt = lower camera elevation angle
    const elev = Math.PI * 0.5 * (1 - tilt * 0.55);
    camera.position.set(0, dist * Math.sin(elev) + TARGET_Y, dist * Math.cos(elev));
    camera.lookAt(0, TARGET_Y, 0);
    controls.target.set(0, TARGET_Y, 0);
    controls.update();
  }
  
  applyDefaultCamera(initialConfig.tilt);
  
  // --- 6. Tooltip Node ---
  const tooltip = document.createElement('div');
  tooltip.className = 'three-chart-tooltip select-none pointer-events-none transition-opacity duration-150';
  tooltip.style.cssText = `
    position: absolute;
    pointer-events: none;
    background: var(--cl-primary, #171717);
    color: var(--cl-on-primary, #ffffff);
    padding: 7px 12px;
    border-radius: 6px;
    font-family: var(--font-sans, Inter, system-ui, sans-serif);
    font-size: 11.5px;
    line-height: 1.45;
    box-shadow: 0 4px 14px rgba(0,0,0,0.22);
    opacity: 0;
    z-index: 50;
    white-space: nowrap;
    transform: translate(-50%, -100%) translateY(-14px);
  `;
  const tooltipParent = container.parentElement || container;
  tooltipParent.appendChild(tooltip);
  
  // Slices & Labels state tracking
  let sliceMeshes = [];
  let hoveredMesh = null;
  let activeIndex = -1;
  let currentConfig = { ...initialConfig };
  let activeSvgOverlay = svgOverlay || null;
  let labelsGroup = null;
  let dynamicLabels = [];

  function setupLabelsGroup(svgEl) {
    if (svgEl) {
      activeSvgOverlay = svgEl;
    }
    if (!activeSvgOverlay) return;

    // Check if group already exists in overlay
    labelsGroup = activeSvgOverlay.querySelector('#dynamic-3d-labels');
    if (!labelsGroup) {
      labelsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      labelsGroup.setAttribute('id', 'dynamic-3d-labels');
      labelsGroup.setAttribute('class', 'dynamic-3d-labels select-none pointer-events-none');
      activeSvgOverlay.appendChild(labelsGroup);
    }
  }

  // --- 7. Build/Update Slices & Labels ---
  function buildSlices(data, config, svgEl) {
    currentConfig = { ...config };
    if (svgEl) {
      activeSvgOverlay = svgEl;
    }
    
    // Dispose previous slice geometries and materials
    sliceMeshes.forEach((mesh) => {
      chartGroup.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    });
    sliceMeshes = [];
    hoveredMesh = null;
    activeIndex = -1;
    tooltip.style.opacity = '0';
    
    // Reset labels group
    setupLabelsGroup();
    if (labelsGroup) {
      while (labelsGroup.firstChild) {
        labelsGroup.removeChild(labelsGroup.firstChild);
      }
    }
    dynamicLabels = [];

    const validData = data.filter((d) => d && typeof d.value === 'number' && d.value > 0);
    const total = validData.reduce((sum, d) => sum + d.value, 0);
    
    if (total === 0) return;
    
    const isDonut = !!config.isDonut;
    const donutHole = isDonut ? Math.max(0.15, Math.min(0.8, config.donutHoleRadius ?? 0.5)) : 0;
    const extrusionHeight = Math.max(0.12, Math.min(1.4, (config.height3D ?? 30) / 48));
    
    // Proportional radius scaled by chartSize (default 100%)
    const chartScale = Math.max(0.4, Math.min(1.6, (config.chartSize ?? 100) / 100));
    const outerRadius = 1.15 * chartScale;
    const innerRadius = outerRadius * donutHole;
    // Keep solid seamless pie chart, small aesthetic gap for donut slices
    const sliceGap = isDonut ? (validData.length > 1 ? 0.012 : 0) : 0;
    
    // Position ground shadow plane just underneath the extruded chart bottom
    shadowMesh.position.y = -extrusionHeight / 2 - 0.015;
    shadowMesh.scale.set(chartScale, chartScale, chartScale);
    
    let currentAngle = -Math.PI / 2; // Start at 12 o'clock (top/back)
    
    validData.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      const endAngle = currentAngle + sliceAngle;
      const midAngle = currentAngle + sliceAngle / 2;
      const percent = (item.value / total) * 100;
      
      const geom = createSliceGeometry(
        currentAngle,
        endAngle,
        outerRadius,
        innerRadius,
        extrusionHeight,
        sliceGap
      );
      
      // Top/bottom cap material
      const topMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(item.color),
        roughness: 0.38,
        metalness: 0.08,
      });
      
      // Side wall material (slightly more matte for definition)
      const sideMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(item.color),
        roughness: 0.48,
        metalness: 0.06,
      });
      
      const mesh = new THREE.Mesh(geom, [topMat, sideMat]);
      
      mesh.userData = {
        index: index,
        label: item.label,
        value: item.value,
        percent: percent,
        color: item.color,
        midAngle: midAngle,
        targetX: 0,
        targetZ: 0,
        targetY: 0,
      };
      
      chartGroup.add(mesh);
      sliceMeshes.push(mesh);

      // Create dynamic SVG pointer line and text element
      const showLabels = config.showLabels !== false && config.labelMode !== 'none';
      if (labelsGroup && percent >= 1.5 && showLabels) {
        const pointer = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        pointer.setAttribute('stroke', '#666666');
        pointer.setAttribute('stroke-width', '1');
        pointer.setAttribute('fill', 'none');
        pointer.setAttribute('opacity', '0.55');
        labelsGroup.appendChild(pointer);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('fill', config.labelColor || '#171717');
        text.setAttribute('font-family', config.fontFamily || 'var(--font-sans)');
        text.setAttribute('font-size', (config.labelFontSize || 9.5).toString());
        text.setAttribute('font-weight', '500');
        labelsGroup.appendChild(text);

        dynamicLabels.push({
          mesh,
          midAngle,
          label: item.label,
          value: item.value,
          percent,
          color: item.color,
          pointer,
          text,
        });
      }
      
      currentAngle = endAngle;
    });
  }
  
  // Initial build
  buildSlices(initialData, initialConfig, svgOverlay);
  
  // --- 8. Hover Interaction & Raycasting ---
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  
  function highlightSlice(mesh) {
    if (hoveredMesh === mesh) return;
    if (hoveredMesh) unhighlightSlice();
    
    hoveredMesh = mesh;
    const data = mesh.userData;
    activeIndex = data.index;
    
    const disablePop = !!currentConfig.disableHoverOffset;
    const chartScale = Math.max(0.4, Math.min(1.6, (currentConfig.chartSize ?? 100) / 100));
    const popDist = disablePop ? 0 : 0.16 * chartScale;
    
    // Move along midAngle on X-Z plane
    mesh.userData.targetX = Math.cos(data.midAngle) * popDist;
    mesh.userData.targetZ = Math.sin(data.midAngle) * popDist;
    mesh.userData.targetY = popDist * 0.35;
    
    // Subtle glow on hovered materials
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((mat) => {
        mat.emissive = new THREE.Color(data.color);
        mat.emissiveIntensity = 0.28;
      });
    }
    
    // Highlight HTML legend item
    const legendItem = document.querySelector(`.legend-item[data-index="${data.index}"]`);
    if (legendItem) {
      legendItem.classList.add('bg-canvas-soft-2', 'border-hairline-strong');
    }
    
    // Show tooltip
    tooltip.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;font-weight:600;">
        <span style="width:7px;height:7px;border-radius:50%;background:${data.color};display:inline-block;shrink:0;"></span>
        <span>${escapeHTML(data.label)}</span>
      </div>
      <div style="font-size:10.5px;opacity:0.85;margin-top:2px;font-family:monospace;">
        ${data.value.toLocaleString()} (${data.percent.toFixed(1)}%)
      </div>
    `;
    tooltip.style.opacity = '1';
  }
  
  function unhighlightSlice() {
    if (!hoveredMesh) return;
    
    const data = hoveredMesh.userData;
    
    // Restore legend item
    const legendItem = document.querySelector(`.legend-item[data-index="${data.index}"]`);
    if (legendItem) {
      legendItem.classList.remove('bg-canvas-soft-2', 'border-hairline-strong');
    }
    
    // Reset positions
    hoveredMesh.userData.targetX = 0;
    hoveredMesh.userData.targetZ = 0;
    hoveredMesh.userData.targetY = 0;
    
    // Reset emissive
    if (Array.isArray(hoveredMesh.material)) {
      hoveredMesh.material.forEach((mat) => {
        mat.emissiveIntensity = 0;
      });
    }
    
    hoveredMesh = null;
    activeIndex = -1;
    tooltip.style.opacity = '0';
  }
  
  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  
  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(sliceMeshes, false);
    
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      highlightSlice(hitMesh);
      canvas.style.cursor = 'pointer';
      
      // Position tooltip clamped within container boundaries
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      tooltip.style.left = `${Math.max(40, Math.min(rect.width - 40, localX))}px`;
      tooltip.style.top = `${Math.max(30, localY)}px`;
      
      // If cursor is in upper area, flip tooltip downwards to prevent covering Title / Subtitle
      if (localY < 85) {
        tooltip.style.transform = 'translate(-50%, 16px)';
      } else {
        tooltip.style.transform = 'translate(-50%, -100%) translateY(-14px)';
      }
    } else {
      if (hoveredMesh) unhighlightSlice();
      canvas.style.cursor = controls.state === -1 ? 'grab' : 'grabbing';
    }
  }
  
  function onPointerDown() {
    canvas.style.cursor = 'grabbing';
  }
  
  function onPointerUp() {
    canvas.style.cursor = 'grab';
  }
  
  function onPointerLeave() {
    if (hoveredMesh) unhighlightSlice();
    canvas.style.cursor = 'default';
  }
  
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  
  // --- 9. Dynamic Callout Labels Projection Update (Runs on Every Frame) ---
  function update3DLabels() {
    if (!activeSvgOverlay) return;

    // Ensure labelsGroup is attached inside activeSvgOverlay (handles re-renders of overlay SVG)
    if (!labelsGroup || !labelsGroup.parentNode || labelsGroup.parentNode !== activeSvgOverlay) {
      setupLabelsGroup(activeSvgOverlay);
      dynamicLabels.forEach((item) => {
        if (item.pointer && item.pointer.parentNode !== labelsGroup) {
          labelsGroup.appendChild(item.pointer);
        }
        if (item.text && item.text.parentNode !== labelsGroup) {
          labelsGroup.appendChild(item.text);
        }
      });
    }
    if (!labelsGroup) return;

    const showLabels = currentConfig.showLabels !== false && currentConfig.labelMode !== 'none';
    if (!showLabels || dynamicLabels.length === 0) {
      labelsGroup.setAttribute('display', 'none');
      return;
    }
    labelsGroup.removeAttribute('display');

    // Chart center projected onto SVG screen space (viewBox 0 0 600 420)
    const centerVec = new THREE.Vector3(0, TARGET_Y, 0).applyMatrix4(chartGroup.matrixWorld).project(camera);
    const centerSvgX = (centerVec.x * 0.5 + 0.5) * SVG_VIEW_WIDTH;
    const centerSvgY = (-centerVec.y * 0.5 + 0.5) * SVG_VIEW_HEIGHT;

    const chartScale = Math.max(0.4, Math.min(1.6, (currentConfig.chartSize ?? 100) / 100));
    const outerRadius = 1.15 * chartScale;
    const extrusionHeight = Math.max(0.12, Math.min(1.4, (currentConfig.height3D ?? 30) / 48));

    for (let i = 0; i < dynamicLabels.length; i++) {
      const item = dynamicLabels[i];
      if (item.percent < 1.5) {
        item.pointer.setAttribute('display', 'none');
        item.text.setAttribute('display', 'none');
        continue;
      }

      // 3D Anchor on top-outer rim of the slice
      const localAnchor = new THREE.Vector3(
        Math.cos(item.midAngle) * outerRadius,
        extrusionHeight / 2,
        Math.sin(item.midAngle) * outerRadius
      );

      // Apply slice mesh world transform (tracks 3D rotation and hover pop-out!)
      const worldAnchor = localAnchor.applyMatrix4(item.mesh.matrixWorld);

      // Project to NDC
      const proj = worldAnchor.project(camera);

      // If behind camera plane or outside viewing frustum, hide
      if (proj.z > 1.0 || proj.z < -1.0) {
        item.pointer.setAttribute('display', 'none');
        item.text.setAttribute('display', 'none');
        continue;
      }

      item.pointer.removeAttribute('display');
      item.text.removeAttribute('display');

      // Convert to SVG viewBox coordinates (600 x 420)
      const svgX = (proj.x * 0.5 + 0.5) * SVG_VIEW_WIDTH;
      const svgY = (-proj.y * 0.5 + 0.5) * SVG_VIEW_HEIGHT;

      // Radial direction outward from screen center
      const dx = svgX - centerSvgX;
      const dy = svgY - centerSvgY;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;

      // In 3D, extend front-facing pointers downward to clear front extrusion wall
      const frontFactor = Math.max(0, dirY);
      const extraFrontY = frontFactor * (extrusionHeight * 16);

      // Outward extension for elbow pointer
      const outerX = svgX + dirX * 12;
      const outerY = svgY + dirY * 10 + extraFrontY;
      const clampedOuterY = Math.max(38, Math.min(SVG_VIEW_HEIGHT - 65, outerY));

      const isRight = dirX >= 0;
      const elbowLen = 10;
      const lineEndX = outerX + (isRight ? elbowLen : -elbowLen);
      const clampedEndX = Math.max(12, Math.min(SVG_VIEW_WIDTH - 12, lineEndX));

      item.pointer.setAttribute(
        'points',
        `${svgX.toFixed(1)},${svgY.toFixed(1)} ${outerX.toFixed(1)},${clampedOuterY.toFixed(1)} ${clampedEndX.toFixed(1)},${clampedOuterY.toFixed(1)}`
      );

      const textX = clampedEndX + (isRight ? 4 : -4);
      const textY = clampedOuterY + 3.5;

      item.text.setAttribute('x', textX.toFixed(1));
      item.text.setAttribute('y', textY.toFixed(1));
      item.text.setAttribute('text-anchor', isRight ? 'start' : 'end');

      formatAndTruncateLabel(
        item.text,
        item.label,
        item.value,
        item.percent,
        isRight ? (SVG_VIEW_WIDTH - 8 - textX) : (textX - 8),
        currentConfig.labelMode
      );

      // If text is hidden (e.g. truncated away completely), also hide pointer line
      if (!item.text.textContent) {
        item.pointer.setAttribute('display', 'none');
      }
    }
  }

  // --- 10. Animation Loop ---
  let animId = null;
  let isDisposed = false;
  
  function animate() {
    if (isDisposed) return;
    animId = requestAnimationFrame(animate);
    
    // Smooth lerp for slice translations
    for (let i = 0; i < sliceMeshes.length; i++) {
      const mesh = sliceMeshes[i];
      const tx = mesh.userData.targetX || 0;
      const tz = mesh.userData.targetZ || 0;
      const ty = mesh.userData.targetY || 0;
      
      mesh.position.x += (tx - mesh.position.x) * 0.18;
      mesh.position.z += (tz - mesh.position.z) * 0.18;
      mesh.position.y += (ty - mesh.position.y) * 0.18;
    }
    
    controls.update();
    renderer.render(scene, camera);

    // Update 3D projected callout labels in real-time
    update3DLabels();
  }
  
  animate();
  
  // --- 11. Container Resize Observer ---
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);
  
  // --- 12. Public API Instance ---
  return {
    /** Rebuilds chart slices and labels with new data or config without destroying the canvas */
    update: (data, config, svgEl) => {
      const tiltChanged = Math.abs((config.tilt ?? 0.55) - (currentConfig.tilt ?? 0.55)) > 0.001;
      buildSlices(data, config, svgEl);
      if (tiltChanged) {
        applyDefaultCamera(config.tilt);
      }
    },
    
    /** Reset camera to standard tilt angle */
    resetCamera: () => {
      applyDefaultCamera(currentConfig.tilt);
      unhighlightSlice();
    },
    
    /** Trigger slice highlight from external legend */
    highlightByIndex: (idx) => {
      const target = sliceMeshes.find((m) => m.userData.index === idx);
      if (target) {
        highlightSlice(target);
        const rect = canvas.getBoundingClientRect();
        tooltip.style.left = `${rect.width / 2}px`;
        tooltip.style.top = `${rect.height / 3}px`;
      }
    },
    
    /** Clear highlight from external legend */
    clearHighlight: () => {
      unhighlightSlice();
    },
    
    /** High-res capture for PNG & PDF exports */
    captureImage: (exportWidth = 1440, exportHeight = 1040) => {
      const origW = renderer.domElement.width;
      const origH = renderer.domElement.height;
      const origAspect = camera.aspect;
      
      // Resize to export dimensions
      renderer.setSize(exportWidth, exportHeight, false);
      camera.aspect = exportWidth / exportHeight;
      camera.updateProjectionMatrix();
      
      // Render frame
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      
      // Restore previous size
      renderer.setSize(origW, origH, false);
      camera.aspect = origAspect;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      
      return dataUrl;
    },
    
    /** Clean disposal of all Three.js resources */
    dispose: () => {
      isDisposed = true;
      if (animId) cancelAnimationFrame(animId);
      
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      
      controls.dispose();
      resizeObserver.disconnect();
      
      shadowMat.dispose();
      shadowTexture.dispose();
      
      sliceMeshes.forEach((mesh) => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        }
      });
      
      if (labelsGroup && labelsGroup.parentNode) {
        labelsGroup.parentNode.removeChild(labelsGroup);
      }
      
      renderer.dispose();
      
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
    },
  };
}
