/**
 * FlowMaker Pro X - Core Engine (v11 Consolidated)
 * Absolute Stability & Unified State
 */

// Configuration
const GRID_SIZE = 10;
const HISTORY_LIMIT = 50;

// Application State
let nodes = [];
let edges = [];
let historyStack = [];
let redoStack = [];

// Interaction Hierarchy
const InteractionMode = {
    IDLE: 'idle',
    DRAGGING: 'dragging',
    RESIZING: 'resizing',
    CONNECTING: 'connecting',
    PANNING: 'panning'
};

let state = {
    mode: InteractionMode.IDLE,
    selectedId: null,      // Unified Selection (Node or Edge ID)
    targetItem: null,      // Object being manipulated (Node/Edge)
    isSpacePressed: false,
    activeTool: 'select',  // 'select' | 'connector'
    zoom: 1,               // Single source of truth for zoom
    projectName: "My Flowchart",
    editingItem: null,     // Currently active editor (node or edge)
    dragOffset: { x: 0, y: 0 }
};

// DOM Elements
const canvas = document.getElementById('flow-canvas');
const nodesLayer = document.getElementById('nodes-layer');
const edgesLayer = document.getElementById('edges-layer');
const labelsLayer = document.getElementById('labels-layer');
const container = document.getElementById('canvas-container');
const nodeEditor = document.getElementById('node-editor');
const edgeEditor = document.getElementById('edge-editor');
const zoomLevelText = document.getElementById('zoom-level');
const nodeCountText = document.getElementById('node-count');
const nameInput = document.getElementById('project-name-input');

/**
 * Initialization
 */
function init() {
    setupInteractionListeners();
    setupKeyboardShortcuts();
    setupControls();
    setupDragAndDrop();

    // Load from LocalStorage or Default
    const saved = localStorage.getItem('flowmaker_pro_x_v11');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            nodes = data.nodes || [];
            edges = data.edges || [];
            state.projectName = data.projectName || "My Flowchart";
            if (nameInput) nameInput.value = state.projectName;
        } catch (e) { console.error("Load failed", e); }
    }

    if (nodes.length === 0) {
        createNode('lead-source', 320, 150, "Start Source");
    }

    saveHistory();
    render();

    window.addEventListener('resize', render);
    lucide.createIcons();
}

/**
 * Robust Coordinate Transformation
 * Converts screen coordinates to Zoom-aware SVG coordinates
 */
function getSVGCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) / state.zoom,
        y: (e.clientY - rect.top) / state.zoom
    };
}

function snap(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

/**
 * Data Operations
 */
function persistToBrowser() {
    const data = JSON.stringify({ nodes, edges, projectName: state.projectName });
    localStorage.setItem('flowmaker_pro_x_v11', data);
}

function saveHistory() {
    const data = JSON.stringify({ nodes, edges });
    if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== data) {
        historyStack.push(data);
        redoStack = [];
        if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
        persistToBrowser(); // Auto-save on every state change
    }
}

function undo() {
    if (historyStack.length <= 1) return;
    redoStack.push(historyStack.pop());
    applyState(JSON.parse(historyStack[historyStack.length - 1]));
}

function redo() {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    historyStack.push(JSON.stringify({ nodes, edges }));
    applyState(JSON.parse(next));
}

function applyState(data) {
    nodes = data.nodes;
    edges = data.edges;
    render();
}

function createNode(type, x, y, label) {
    const id = `node-${Date.now()}`;
    // Dynamic defaults per type
    let w = 160, h = 60;
    if (type === 'decision') { w = 160; h = 120; }
    else if (type === 'lead-source') { w = 180; h = 50; }
    else if (type === 'database') { w = 160; h = 70; }
    else if (type === 'api') { w = 180; h = 50; }
    else if (type === 'user') { w = 140; h = 60; }
    else if (type === 'document') { w = 140; h = 80; }
    else if (type === 'cloud') { w = 160; h = 100; }

    // Check if label was provided, if not populate default
    if (!label) {
        label = type === 'lead-source' ? 'Trigger' :
            type === 'database' ? 'Database' :
                type === 'api' ? 'API Request' :
                    type === 'user' ? 'User Input' :
                        type === 'document' ? 'Document' :
                            type === 'cloud' ? 'Cloud' :
                                type.charAt(0).toUpperCase() + type.slice(1);
    }

    const node = { id, type, x: snap(x), y: snap(y), width: w, height: h, label };
    nodes.push(node);
    return node;
}

function deleteSelected() {
    if (!state.selectedId) {
        console.warn("No item selected for deletion");
        return;
    }

    const nodeIdx = nodes.findIndex(n => n.id === state.selectedId);
    if (nodeIdx !== -1) {
        nodes.splice(nodeIdx, 1);
        edges = edges.filter(e => e.source !== state.selectedId && e.target !== state.selectedId);
    } else {
        const edgeIdx = edges.findIndex(e => e.id === state.selectedId);
        if (edgeIdx !== -1) {
            edges.splice(edgeIdx, 1);
        }
    }

    state.selectedId = null;
    closeEditors();
    saveHistory();
    render();
}

/**
 * Rendering Logic
 */
function render() {
    renderEdges();
    renderNodes();
    updateUI();
}

function renderNodes() {
    nodesLayer.innerHTML = '';
    nodes.forEach(node => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", `node-group ${state.selectedId === node.id ? 'selected' : ''}`);
        g.setAttribute("transform", `translate(${node.x}, ${node.y})`);
        g.setAttribute("data-node-type", node.type);

        let shape;
        if (node.type === 'decision') {
            shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            const hw = node.width / 2;
            const hh = node.height / 2;
            shape.setAttribute("points", `0,${hh} ${hw},0 ${node.width},${hh} ${hw},${node.height}`);
            shape.setAttribute("class", "node-diamond");
        } else if (node.type === 'document') {
            shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const w = node.width;
            const h = node.height;
            shape.setAttribute("d", `M 0 0 L ${w} 0 L ${w} ${h - 15} Q ${w * 0.75} ${h}, ${w * 0.5} ${h - 15} T 0 ${h - 15} Z`);
            shape.setAttribute("class", "node-path");
        } else if (node.type === 'cloud') {
            shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const w = node.width;
            const h = node.height;
            // Approximate cloud bounding box scaling
            shape.setAttribute("d", `M ${w * 0.2} ${h * 0.5} 
                C ${w * 0.2} ${h * 0.2}, ${w * 0.5} ${h * 0.1}, ${w * 0.6} ${h * 0.3} 
                C ${w * 0.8} ${h * 0.2}, ${w} ${h * 0.4}, ${w * 0.9} ${h * 0.6}
                C ${w} ${h * 0.8}, ${w * 0.7} ${h}, ${w * 0.5} ${h * 0.9}
                C ${w * 0.3} ${h}, 0 ${h * 0.8}, ${w * 0.1} ${h * 0.6}
                C 0 ${h * 0.4}, ${w * 0.2} ${h * 0.3}, ${w * 0.2} ${h * 0.5} Z`);
            shape.setAttribute("class", "node-path");
        } else {
            shape = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            shape.setAttribute("width", node.width);
            shape.setAttribute("height", node.height);
            shape.setAttribute("class", "node-rect");
            // Beautiful tailored shapes per node type
            if (node.type === 'user' || node.type === 'lead-source' || node.type === 'api') {
                shape.setAttribute("rx", Math.min(node.width, node.height) / 2);
                shape.setAttribute("ry", Math.min(node.width, node.height) / 2);
            } else {
                shape.setAttribute("rx", 12);
                shape.setAttribute("ry", 12);
            }
        }

        let fX = 0, fY = 0, fW = node.width, fH = node.height;
        if (node.type === 'decision') {
            fX = node.width * 0.15;
            fY = node.height * 0.15;
            fW = node.width * 0.7;
            fH = node.height * 0.7;
        }

        const foreign = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
        foreign.setAttribute("x", fX);
        foreign.setAttribute("y", fY);
        foreign.setAttribute("width", fW);
        foreign.setAttribute("height", fH);
        foreign.setAttribute("pointer-events", "none");
        foreign.setAttribute("class", "node-foreign-object");

        const div = document.createElement("div");
        div.setAttribute("class", `node-text-container ${node.type}`);

        const textDiv = document.createElement("div");
        textDiv.setAttribute("class", "node-text-content");
        textDiv.textContent = node.label;

        div.appendChild(textDiv);
        foreign.appendChild(div);

        // Text selection/editing is handled via node dblclick now

        // Interactive Icons (Grouped for better hit area)
        const createIconButton = (x, y, type, callback) => {
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("class", `node-${type}-icon`);

            const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            bg.setAttribute("x", x - 12); bg.setAttribute("y", y - 12);
            bg.setAttribute("width", 24); bg.setAttribute("height", 24);
            bg.setAttribute("fill", "transparent");
            bg.setAttribute("class", "icon-hitbox");

            const icon = document.createElementNS("http://www.w3.org/2000/svg", "text");
            icon.setAttribute("x", x); icon.setAttribute("y", y + 4);
            icon.setAttribute("text-anchor", "middle");
            icon.textContent = type === 'delete' ? '🗑' : '✎';

            group.append(bg, icon);

            // CRITICAL FIX: Use mousedown with stopPropagation to block dragging
            group.onmousedown = (e) => {
                e.stopPropagation();
                callback();
            };
            group.onclick = (e) => e.stopPropagation();
            return group;
        };

        const delBtn = createIconButton(node.width - 20, 20, 'delete', () => {
            state.selectedId = node.id;
            deleteSelected();
        });
        const editBtn = createIconButton(20, 20, 'edit', () => {
            openNodeEditor(node);
        });

        // Edit button is visible on hover (handled via CSS)

        const resBtn = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        resBtn.setAttribute("cx", node.width - 6); resBtn.setAttribute("cy", node.height - 6); resBtn.setAttribute("r", 7);
        resBtn.setAttribute("class", "resize-handle");
        resBtn.onmousedown = (e) => { e.stopPropagation(); startResizing(e, node); };

        g.append(shape, foreign, delBtn, editBtn, resBtn);

        g.onmousedown = (e) => {
            if (e.target.closest('.icon-hitbox')) return; // Extra safety
            e.stopPropagation();
            state.selectedId = node.id;
            if (state.activeTool === 'connector') startConnecting(e, node);
            else startDragging(e, node);
            render();
        };

        // Double click anywhere on the node to edit instantly
        g.ondblclick = (e) => {
            e.stopPropagation();
            openNodeEditor(node);
        };

        nodesLayer.appendChild(g);
    });
}

function renderEdges() {
    edgesLayer.innerHTML = '';
    labelsLayer.innerHTML = '';
    edges.forEach(edge => {
        const s = nodes.find(n => n.id === edge.source);
        const t = nodes.find(n => n.id === edge.target);
        if (!s || !t) return;

        const x1 = s.x + s.width / 2; const y1 = s.y + s.height;
        const x2 = t.x + t.width / 2; const y2 = t.y;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const cpY = y1 + (y2 - y1) / 2;
        path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${cpY}, ${x2} ${cpY}, ${x2} ${y2}`);
        path.setAttribute("class", `edge-path ${state.selectedId === edge.id ? 'selected' : ''}`);
        path.onclick = (e) => { e.stopPropagation(); state.selectedId = edge.id; render(); };
        edgesLayer.appendChild(path);

        const midX = (x1 + x2) / 2;
        const midY = 0.125 * y1 + 0.75 * cpY + 0.125 * y2; // Precise Cubic Bezier Midpoint (t=0.5)

        const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        labelGroup.setAttribute("transform", `translate(${midX}, ${midY})`);

        const label = edge.label || "+";
        const w = Math.max(24, label.length * 9 + 12);
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", -w / 2); bg.setAttribute("y", -11);
        bg.setAttribute("width", w); bg.setAttribute("height", 22);
        bg.setAttribute("class", "edge-label-bg");

        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("class", "edge-label-text"); txt.setAttribute("dy", 5);
        txt.textContent = label;

        labelGroup.append(bg, txt);

        // Use onmousedown for faster response and consistency with nodes
        labelGroup.onmousedown = (e) => {
            e.stopPropagation();
            state.selectedId = edge.id;
            openEdgeEditor(edge, midX, midY);
            render();
        };
        labelsLayer.appendChild(labelGroup);
    });
}

/**
 * Interaction Engine
 */
function startDragging(e, node) {
    state.mode = InteractionMode.DRAGGING;
    state.targetItem = node;
    const coords = getSVGCoords(e);
    state.dragOffset.x = coords.x - node.x;
    state.dragOffset.y = coords.y - node.y;
    container.style.cursor = 'grabbing';
}

function startResizing(e, node) {
    state.mode = InteractionMode.RESIZING;
    state.targetItem = node;
    container.style.cursor = 'nwse-resize';
}

function startConnecting(e, node) {
    state.mode = InteractionMode.CONNECTING;
    state.targetItem = node;
}

function setupInteractionListeners() {
    window.addEventListener('mousemove', (e) => {
        if (state.mode === InteractionMode.IDLE) return;
        const coords = getSVGCoords(e);

        if (state.mode === InteractionMode.DRAGGING) {
            state.targetItem.x = snap(coords.x - state.dragOffset.x);
            state.targetItem.y = snap(coords.y - state.dragOffset.y);
        } else if (state.mode === InteractionMode.RESIZING) {
            state.targetItem.width = Math.max(80, snap(coords.x - state.targetItem.x));
            state.targetItem.height = Math.max(40, snap(coords.y - state.targetItem.y));
        } else if (state.mode === InteractionMode.CONNECTING) {
            drawTempLine(coords.x, coords.y);
        }
        render();
    });

    window.addEventListener('mouseup', (e) => {
        if (state.mode === InteractionMode.CONNECTING) finalizeConnection(e);
        if (state.mode !== InteractionMode.IDLE) saveHistory();

        state.mode = InteractionMode.IDLE;
        state.targetItem = null;
        container.style.cursor = state.activeTool === 'connector' ? 'crosshair' : 'default';
        const tempLine = document.getElementById('temp-line');
        if (tempLine) tempLine.remove();
        render();
    });

    container.onmousedown = (e) => {
        // Only close editors if we click the canvas itself, not the HUD or editors
        if (e.target === canvas || e.target === container) {
            container.focus();
            closeEditors();
            state.selectedId = null;
            render();
        }
    };
}

function drawTempLine(tx, ty) {
    let line = document.getElementById('temp-line');
    if (!line) {
        line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.id = 'temp-line';
        line.setAttribute("class", "edge-path temporary");
        edgesLayer.appendChild(line);
    }
    const s = state.targetItem;
    const x1 = s.x + s.width / 2; const y1 = s.y + s.height;
    line.setAttribute("d", `M ${x1} ${y1} C ${x1} ${y1 + (ty - y1) / 2}, ${tx} ${y1 + (ty - y1) / 2}, ${tx} ${ty}`);
}

function finalizeConnection(e) {
    const coords = getSVGCoords(e);
    const target = nodes.find(n => (
        n.id !== state.targetItem.id &&
        coords.x > n.x && coords.x < n.x + n.width &&
        coords.y > n.y && coords.y < n.y + n.height
    ));
    if (target) {
        edges.push({ id: `edge-${Date.now()}`, source: state.targetItem.id, target: target.id, label: "" });
        saveHistory();
    }
}

/**
 * Editing Layer
 */
function openNodeEditor(node) {
    if (state.editingItem && state.editingItem.id === node.id) return;
    closeEditors();
    state.selectedId = node.id;
    state.editingItem = { type: 'node', id: node.id };
    nodeEditor.style.display = 'block';
    nodeEditor.value = node.label;

    // Zoom-aware positioning
    const rect = canvas.getBoundingClientRect();

    let editX = node.x;
    let editY = node.y;
    let editW = node.width;
    let editH = node.height;

    if (node.type === 'decision') {
        editX += node.width * 0.15;
        editY += node.height * 0.15;
        editW = node.width * 0.7;
        editH = node.height * 0.7;
    }

    nodeEditor.style.left = `${rect.left + editX * state.zoom}px`;
    nodeEditor.style.top = `${rect.top + editY * state.zoom}px`;
    nodeEditor.style.width = `${editW * state.zoom}px`;

    // Let height auto-expand based on content, min height is initial height
    nodeEditor.style.minHeight = `${editH * state.zoom}px`;
    nodeEditor.style.height = 'auto'; // Reset to auto so scrollHeight calculates correctly
    nodeEditor.style.fontSize = `${Math.max(12, 14 * state.zoom)}px`;

    // Auto-resize textarea as we type
    const autoResize = () => {
        nodeEditor.style.height = 'auto';
        nodeEditor.style.height = Math.max(editH * state.zoom, nodeEditor.scrollHeight + 5) + 'px';
    };
    nodeEditor.oninput = autoResize;

    setTimeout(() => {
        nodeEditor.focus();
        nodeEditor.select(); // Select all text for easy replacement
        autoResize(); // Initial sizing
    }, 20);
}

function openEdgeEditor(edge, midX, midY) {
    if (state.editingItem && state.editingItem.id === edge.id) return;
    closeEditors();
    state.selectedId = edge.id;
    state.editingItem = { type: 'edge', id: edge.id };
    edgeEditor.style.display = 'block';
    edgeEditor.value = edge.label || "";

    // Zoom-aware positioning for edge label (mini-node style)
    const rect = canvas.getBoundingClientRect();
    const w = 140;

    // Position dynamically based on the edge label text
    edgeEditor.style.left = `${rect.left + midX * state.zoom - w / 2}px`;
    edgeEditor.style.top = `${rect.top + midY * state.zoom - 15}px`;
    edgeEditor.style.width = `${w}px`;
    edgeEditor.style.height = `${32}px`;
    edgeEditor.style.fontSize = `13px`;

    setTimeout(() => {
        edgeEditor.focus();
        edgeEditor.select();
    }, 20);
}

function closeEditors() {
    if (state.editingItem) {
        const item = state.editingItem.type === 'node' ?
            nodes.find(n => n.id === state.editingItem.id) :
            edges.find(e => e.id === state.editingItem.id);
        if (item) {
            item.label = (state.editingItem.type === 'node' ? nodeEditor : edgeEditor).value;
            saveHistory();
        }
    }
    nodeEditor.style.display = 'none';
    edgeEditor.style.display = 'none';
    state.editingItem = null;
    render();
}

function updateUI() {
    const scale = `scale(${state.zoom})`;
    nodesLayer.setAttribute("transform", scale);
    edgesLayer.setAttribute("transform", scale);
    labelsLayer.setAttribute("transform", scale);
    zoomLevelText.textContent = `${Math.round(state.zoom * 100)}%`;
    nodeCountText.textContent = `${nodes.length} NODES`;
}

/**
 * Controls & Global Listeners
 */
function setupKeyboardShortcuts() {
    window.onkeydown = (e) => {
        if (e.code === 'Space') state.isSpacePressed = true;
        if ((e.key === 'Delete' || e.key === 'Backspace') && !state.editingItem) {
            const active = document.activeElement.tagName;
            if (active !== 'INPUT' && active !== 'TEXTAREA') {
                deleteSelected();
                e.preventDefault();
            }
        }
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); undo(); }
            if (e.key === 'y') { e.preventDefault(); redo(); }
            if (e.key === 's') { e.preventDefault(); persistToBrowser(); alert("Project Saved!"); }
        }
    };
    window.onkeyup = (e) => { if (e.code === 'Space') state.isSpacePressed = false; };
    [nodeEditor, edgeEditor].forEach(el => {
        el.onmousedown = (e) => e.stopPropagation(); // CRITICAL: Stop canvas from closing editor
        el.onblur = closeEditors;
        el.onkeydown = (ev) => {
            if (ev.key === 'Enter') {
                // If it's the node editor and shift is NOT held, save.
                // If shift IS held, let the default textarea newline happen.
                if (el.id === 'edge-editor' || !ev.shiftKey) {
                    ev.preventDefault();
                    closeEditors();
                }
            }
            if (ev.key === 'Escape') {
                state.editingItem = null; // Don't save on Escape
                closeEditors();
            }
        };
    });
}

function setupControls() {
    document.getElementById('undo-btn').onclick = undo;
    document.getElementById('redo-btn').onclick = redo;
    document.getElementById('zoom-in').onclick = () => { state.zoom *= 1.2; render(); };
    document.getElementById('zoom-out').onclick = () => { state.zoom *= 0.8; render(); };
    document.getElementById('reset-view').onclick = () => { state.zoom = 1; render(); };
    document.getElementById('clear-btn').onclick = () => { if (confirm("Clear Workspace?")) { nodes = []; edges = []; saveHistory(); render(); } };
    document.getElementById('theme-toggle').onclick = () => {
        document.body.classList.toggle('light-theme');
        document.body.classList.toggle('dark-theme');
        lucide.createIcons();
    };

    const header = document.getElementById('top-bar');
    const toggleBtn = document.getElementById('toggle-header-btn');
    if (header && toggleBtn) {
        let isHeaderHidden = false;
        toggleBtn.onclick = () => {
            isHeaderHidden = !isHeaderHidden;
            if (isHeaderHidden) {
                header.classList.add('hidden');
                toggleBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
            } else {
                header.classList.remove('hidden');
                toggleBtn.innerHTML = '<i data-lucide="chevron-up"></i>';
            }
            lucide.createIcons();
        };
    }

    const sidebar = document.getElementById('left-dock');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    if (sidebar && toggleSidebarBtn) {
        let isSidebarHidden = false;
        toggleSidebarBtn.onclick = () => {
            isSidebarHidden = !isSidebarHidden;
            if (isSidebarHidden) {
                sidebar.classList.add('hidden');
                toggleSidebarBtn.classList.add('sidebar-hidden');
                toggleSidebarBtn.innerHTML = '<i data-lucide="chevron-right"></i>';
            } else {
                sidebar.classList.remove('hidden');
                toggleSidebarBtn.classList.remove('sidebar-hidden');
                toggleSidebarBtn.innerHTML = '<i data-lucide="chevron-left"></i>';
            }
            lucide.createIcons();
        };
    }

    if (nameInput) {
        nameInput.oninput = (e) => { state.projectName = e.target.value || "My Flowchart"; persistToBrowser(); };
    }

    document.getElementById('save-project-btn').onclick = () => { persistToBrowser(); alert("Project Saved to Browser!"); };

    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) exportPdfBtn.onclick = exportPDF;

    document.getElementById('export-btn').onclick = exportPNG;

    document.getElementById('connector-tool').onclick = () => {
        state.activeTool = state.activeTool === 'connector' ? 'select' : 'connector';
        document.getElementById('connector-tool').classList.toggle('active', state.activeTool === 'connector');
        container.style.cursor = state.activeTool === 'connector' ? 'crosshair' : 'default';
    };
}

function setupDragAndDrop() {
    document.querySelectorAll('.palette-item[draggable="true"]').forEach(item => {
        item.ondragstart = (e) => e.dataTransfer.setData('type', item.dataset.type);
    });
    container.ondragover = (e) => e.preventDefault();
    container.ondrop = (e) => {
        const type = e.dataTransfer.getData('type');
        const coords = getSVGCoords(e);
        createNode(type, coords.x - 80, coords.y - 20, null); // Label resolved internally
        saveHistory();
        render();
    };
}

async function exportPDF() {
    const { jsPDF } = window.jspdf;

    // Unselect to hide glowing borders in export
    const oldSelected = state.selectedId;
    state.selectedId = null;
    closeEditors();
    render();

    try {
        const dataUrl = await domtoimage.toPng(container, {
            bgcolor: getComputedStyle(document.body).getPropertyValue('--bg-canvas').trim(),
            width: container.clientWidth,
            height: container.clientHeight,
            style: { transform: 'scale(1)', transformOrigin: 'top left' }
        });

        const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [container.clientWidth, container.clientHeight] });
        doc.addImage(dataUrl, 'PNG', 0, 0, container.clientWidth, container.clientHeight);
        doc.save(`${state.projectName.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch (e) {
        console.error("PDF Export Error: ", e);
        alert("Export failed. Please try again.");
    } finally {
        state.selectedId = oldSelected;
        render();
    }
}

function exportPNG() {
    // Unselect to hide glowing borders in export
    const oldSelected = state.selectedId;
    state.selectedId = null;
    closeEditors();
    render();

    domtoimage.toPng(container, {
        bgcolor: getComputedStyle(document.body).getPropertyValue('--bg-canvas').trim(),
        width: container.clientWidth,
        height: container.clientHeight,
        style: { transform: 'scale(1)', transformOrigin: 'top left' }
    }).then(dataUrl => {
        const link = document.createElement('a');
        link.download = `${state.projectName.toLowerCase().replace(/\s+/g, '-')}.png`;
        link.href = dataUrl;
        link.click();
    }).catch(e => {
        console.error("PNG Export Error: ", e);
        alert("Export failed. Please try again.");
    }).finally(() => {
        state.selectedId = oldSelected;
        render();
    });
}

init();
