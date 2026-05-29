<script lang="ts">
  import type { FlowGraph, GraphEdge, GraphNode, NodeShape } from '$lib/types/graph';
  import { mermaidToGraph } from '$lib/util/mermaidParser';
  import { graphToMermaid } from '$lib/util/mermaidSerializer';
  import { computeLayout } from '$lib/util/simpleLayout';
  import { untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  interface Props {
    code: string;
    oncodechange: (code: string) => void;
  }
  const { code, oncodechange }: Props = $props();

  // ── Pan / zoom ──────────────────────────────────────────────────────
  let svgEl: SVGSVGElement | undefined = $state();
  let pan = $state({ x: 60, y: 60 });
  let scale = $state(1);
  let isPanning = $state(false);
  let panStart = $state({ mx: 0, my: 0, px: 0, py: 0 });

  // ── Graph ───────────────────────────────────────────────────────────
  let graph = $state<FlowGraph | null>(null);
  let positions = new SvelteMap<string, { x: number; y: number }>();
  let lastCanvasCode = $state('');

  $effect(() => {
    if (code === lastCanvasCode) return;
    const parsed = mermaidToGraph(code);
    if (!parsed) return;
    untrack(() => {
      positions = new SvelteMap(computeLayout(parsed, positions));
      graph = parsed;
    });
  });

  // ── Node dimensions (dynamic) ───────────────────────────────────────
  function getNodeDims(node: Pick<GraphNode, 'label' | 'shape'>): { w: number; h: number } {
    const textPx = node.label.length * 7.5 + 32;
    switch (node.shape) {
      case 'diamond': {
        const s = Math.max(90, textPx * 0.75);
        return { w: s * 1.5, h: s };
      }
      case 'circle': {
        const r = Math.max(36, textPx / 2 + 12);
        return { w: r * 2, h: r * 2 };
      }
      default:
        return { w: Math.max(120, textPx), h: 46 };
    }
  }

  // ── Interaction state ───────────────────────────────────────────────
  interface DragState {
    id: string;
    offsetX: number;
    offsetY: number;
  }
  let dragging = $state<DragState | null>(null);
  let selectedId = $state<string | null>(null);
  let editingNode = $state<{ id: string; value: string } | null>(null);
  let editingEdge = $state<{ id: string; value: string } | null>(null);
  let connectSource = $state<string | null>(null); // classic edge-connect mode
  let mousePos = $state({ x: 0, y: 0 }); // canvas coords

  // Ghost node: a transparent preview that follows the mouse before placement
  let ghostNode = $state<{ shape: NodeShape; sourceId: string } | null>(null);

  // ── Toolbar state ───────────────────────────────────────────────────
  let addNodeMode = $state(false);
  let nextShape = $state<NodeShape>('rect');
  let showNodeDropdown = $state(false);

  const COLORS = [
    { label: 'None', value: '' },
    { label: 'Blue', value: '#bfdbfe' },
    { label: 'Green', value: '#bbf7d0' },
    { label: 'Yellow', value: '#fef08a' },
    { label: 'Orange', value: '#fed7aa' },
    { label: 'Red', value: '#fecaca' },
    { label: 'Purple', value: '#e9d5ff' },
    { label: 'Pink', value: '#fbcfe8' },
    { label: 'Slate', value: '#cbd5e1' }
  ];

  const SHAPES: { shape: NodeShape; title: string }[] = [
    { shape: 'rect', title: 'Rectangle [ ]' },
    { shape: 'rounded', title: 'Rounded ( )' },
    { shape: 'diamond', title: 'Diamond { }' },
    { shape: 'circle', title: 'Circle (( ))' },
    { shape: 'stadium', title: 'Stadium ([ ])' }
  ];

  // ── Helpers ─────────────────────────────────────────────────────────
  function screenToCanvas(sx: number, sy: number) {
    if (!svgEl) return { x: 0, y: 0 };
    const r = svgEl.getBoundingClientRect();
    return { x: (sx - r.left - pan.x) / scale, y: (sy - r.top - pan.y) / scale };
  }

  function emitCode() {
    if (!graph) return;
    const c = graphToMermaid(graph);
    lastCanvasCode = c;
    oncodechange(c);
  }

  function getNodePos(id: string) {
    return positions.get(id) ?? { x: 0, y: 0 };
  }

  function nodeCenter(id: string) {
    const p = getNodePos(id);
    const n = graph?.nodes.find((n) => n.id === id);
    const d = n ? getNodeDims(n) : { w: 120, h: 46 };
    return { x: p.x + d.w / 2, y: p.y + d.h / 2 };
  }

  function rectIntersect(nx: number, ny: number, w: number, h: number, tx: number, ty: number) {
    const cx = nx + w / 2,
      cy = ny + h / 2;
    const dx = tx - cx,
      dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const s = Math.min(w / 2 / Math.abs(dx || 1), h / 2 / Math.abs(dy || 1));
    return { x: cx + dx * s, y: cy + dy * s };
  }

  function edgePath(edge: GraphEdge): string {
    const sn = graph?.nodes.find((n) => n.id === edge.source);
    const tn = graph?.nodes.find((n) => n.id === edge.target);
    const sd = sn ? getNodeDims(sn) : { w: 120, h: 46 };
    const td = tn ? getNodeDims(tn) : { w: 120, h: 46 };
    const sp = getNodePos(edge.source),
      tp = getNodePos(edge.target);
    const sc = { x: sp.x + sd.w / 2, y: sp.y + sd.h / 2 };
    const tc = { x: tp.x + td.w / 2, y: tp.y + td.h / 2 };
    const src = rectIntersect(sp.x, sp.y, sd.w, sd.h, tc.x, tc.y);
    const tgt = rectIntersect(tp.x, tp.y, td.w, td.h, sc.x, sc.y);
    return `M ${src.x} ${src.y} L ${tgt.x} ${tgt.y}`;
  }

  function edgeMid(edge: GraphEdge) {
    const sc = nodeCenter(edge.source),
      tc = nodeCenter(edge.target);
    return { x: (sc.x + tc.x) / 2, y: (sc.y + tc.y) / 2 };
  }

  // ── Mouse handlers ───────────────────────────────────────────────────
  function onMouseMove(e: MouseEvent) {
    mousePos = screenToCanvas(e.clientX, e.clientY);
    if (dragging) {
      positions.set(dragging.id, {
        x: mousePos.x - dragging.offsetX,
        y: mousePos.y - dragging.offsetY
      });
    } else if (isPanning) {
      pan = {
        x: panStart.px + (e.clientX - panStart.mx),
        y: panStart.py + (e.clientY - panStart.my)
      };
    }
  }

  function onMouseUp() {
    if (dragging) {
      dragging = null;
      emitCode();
    }
    isPanning = false;
  }

  function onSvgClick(e: MouseEvent) {
    showNodeDropdown = false;
    const target = e.target as SVGElement;
    const isCanvas = target.tagName === 'svg' || target.classList.contains('canvas-bg');
    if (!isCanvas) return;

    if (ghostNode) {
      placeGhostNode(mousePos);
      return;
    }
    if (addNodeMode) {
      addNodeAtPos(mousePos);
      addNodeMode = false;
      return;
    }
    if (connectSource) {
      connectSource = null;
      return;
    }
    selectedId = null;
    editingNode = null;
    editingEdge = null;
  }

  function onSvgMouseDown(e: MouseEvent) {
    const target = e.target as SVGElement;
    const isCanvas = target.tagName === 'svg' || target.classList.contains('canvas-bg');
    if (isCanvas && (e.button === 1 || e.altKey)) {
      e.preventDefault();
      isPanning = true;
      panStart = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    scale = Math.min(3, Math.max(0.15, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
  }

  function startDrag(e: MouseEvent, id: string) {
    if (connectSource || ghostNode) return;
    e.stopPropagation();
    const cp = screenToCanvas(e.clientX, e.clientY);
    const pos = getNodePos(id);
    dragging = { id, offsetX: cp.x - pos.x, offsetY: cp.y - pos.y };
    selectedId = id;
    editingNode = null;
    editingEdge = null;
  }

  function onNodeMouseUp(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (dragging?.id === id) {
      dragging = null;
      emitCode();
      return;
    }
    if (connectSource && connectSource !== id) {
      addEdge(connectSource, id);
      connectSource = null;
    }
    if (ghostNode && ghostNode.sourceId !== id) {
      placeGhostNode(mousePos);
    }
  }

  function onNodeClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (ghostNode) {
      placeGhostNode(mousePos);
      return;
    }
    if (connectSource === '__pick__') {
      connectSource = id;
      return;
    }
    if (connectSource && connectSource !== id) {
      addEdge(connectSource, id);
      connectSource = null;
      return;
    }
    selectedId = id;
    editingEdge = null;
  }

  function onNodeDblClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    ghostNode = null;
    const node = graph?.nodes.find((n) => n.id === id);
    if (node) {
      editingNode = { id, value: node.label };
      editingEdge = null;
    }
  }

  function commitNodeLabel() {
    if (!editingNode || !graph) return;
    const en = editingNode;
    const idx = graph.nodes.findIndex((n) => n.id === en.id);
    if (idx !== -1) {
      graph.nodes[idx] = { ...graph.nodes[idx], label: en.value };
      graph = { ...graph };
      emitCode();
    }
    editingNode = null;
  }

  function onNodeLabelKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitNodeLabel();
    }
    if (e.key === 'Escape') editingNode = null;
  }

  function onEdgeClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    selectedId = id;
    editingNode = null;
    editingEdge = null;
  }

  function onEdgeDblClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    const edge = graph?.edges.find((ed) => ed.id === id);
    if (edge) {
      editingEdge = { id, value: edge.label ?? '' };
      editingNode = null;
    }
  }

  function commitEdgeLabel() {
    if (!editingEdge || !graph) return;
    const ee = editingEdge;
    const idx = graph.edges.findIndex((ed) => ed.id === ee.id);
    if (idx !== -1) {
      const v = editingEdge.value.trim();
      graph.edges[idx] = { ...graph.edges[idx], label: v || undefined };
      graph = { ...graph };
      emitCode();
    }
    editingEdge = null;
  }

  function onEdgeLabelKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdgeLabel();
    }
    if (e.key === 'Escape') editingEdge = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      ghostNode = null;
      connectSource = null;
      addNodeMode = false;
      showNodeDropdown = false;
      editingNode = null;
      editingEdge = null;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !editingNode && !editingEdge)
      deleteSelected();
  }

  // ── Ghost node (quick-add from selection) ───────────────────────────
  function startGhostNode(shape: NodeShape) {
    if (!selectedId) return;
    ghostNode = { shape, sourceId: selectedId };
    editingNode = null;
    editingEdge = null;
  }

  function placeGhostNode(pos: { x: number; y: number }) {
    if (!ghostNode || !graph) {
      ghostNode = null;
      return;
    }
    const sourceId = ghostNode.sourceId;
    const shape = ghostNode.shape;
    ghostNode = null;

    let n = 1;
    while (graph.nodes.find((nd) => nd.id === `node${n}`)) n++;
    const id = `node${n}`;

    const dims = getNodeDims({ label: id, shape });
    const newPos = { x: pos.x - dims.w / 2, y: pos.y - dims.h / 2 };

    graph = {
      ...graph,
      nodes: [...graph.nodes, { id, label: id, shape }],
      edges: [...graph.edges, { id: `e${Date.now()}`, source: sourceId, target: id, type: 'arrow' }]
    };
    positions.set(id, newPos);
    selectedId = id;
    editingNode = { id, value: id };
    emitCode();
  }

  // ── Other actions ────────────────────────────────────────────────────
  function addNodeAtPos(pos: { x: number; y: number }) {
    if (!graph) graph = { direction: 'TD', nodes: [], edges: [] };
    let n = 1;
    while (graph.nodes.find((nd) => nd.id === `node${n}`)) n++;
    const id = `node${n}`;
    const dims = getNodeDims({ label: id, shape: nextShape });
    graph = { ...graph, nodes: [...graph.nodes, { id, label: id, shape: nextShape }] };
    positions.set(id, { x: pos.x - dims.w / 2, y: pos.y - dims.h / 2 });
    emitCode();
    editingNode = { id, value: id };
    selectedId = id;
  }

  function addEdge(sourceId: string, targetId: string) {
    if (!graph || graph.edges.some((e) => e.source === sourceId && e.target === targetId)) return;
    graph = {
      ...graph,
      edges: [
        ...graph.edges,
        { id: `e${Date.now()}`, source: sourceId, target: targetId, type: 'arrow' }
      ]
    };
    emitCode();
  }

  function deleteSelected() {
    if (!selectedId || !graph) return;
    if (graph.edges.find((e) => e.id === selectedId)) {
      graph = { ...graph, edges: graph.edges.filter((e) => e.id !== selectedId) };
    } else {
      graph = {
        ...graph,
        nodes: graph.nodes.filter((n) => n.id !== selectedId),
        edges: graph.edges.filter((e) => e.source !== selectedId && e.target !== selectedId)
      };
      positions.delete(selectedId);
    }
    selectedId = null;
    emitCode();
  }

  function cycleDirection() {
    if (!graph) return;
    const dirs = ['TD', 'LR', 'BT', 'RL'] as const;
    graph = { ...graph, direction: dirs[(dirs.indexOf(graph.direction) + 1) % dirs.length] };
    positions = new SvelteMap(computeLayout(graph, new Map()));
    emitCode();
  }

  function resetLayout() {
    if (!graph) return;
    positions = new SvelteMap(computeLayout(graph, new Map()));
  }

  function selectShape(shape: NodeShape) {
    nextShape = shape;
    addNodeMode = true;
    showNodeDropdown = false;
  }

  function clickOutside(el: HTMLElement, cb: () => void) {
    function handle(e: MouseEvent) {
      if (!el.contains(e.target as Node)) cb();
    }
    document.addEventListener('mousedown', handle);
    return {
      destroy() {
        document.removeEventListener('mousedown', handle);
      }
    };
  }

  function setNodeColor(color: string) {
    if (!selectedId || !graph) return;
    const idx = graph.nodes.findIndex((n) => n.id === selectedId);
    if (idx === -1) return;
    graph.nodes[idx] = { ...graph.nodes[idx], color: color || undefined };
    graph = { ...graph };
    emitCode();
  }

  // ── Derived ─────────────────────────────────────────────────────────
  let selectedNode = $derived(graph?.nodes.find((n) => n.id === selectedId) ?? null);

  function nodeFill(node: GraphNode, sel: boolean) {
    if (sel) return node.color ? lighten(node.color) : '#dbeafe';
    return node.color ?? 'white';
  }
  function nodeStroke(node: GraphNode, sel: boolean) {
    return sel ? '#2563eb' : node.color ? darken(node.color) : '#94a3b8';
  }
  function lighten(hex: string) {
    const n = parseInt(hex.replace('#', ''), 16);
    const b = (c: number) => Math.min(255, c + Math.round((255 - c) * 0.3));
    const r = b((n >> 16) & 0xff),
      g = b((n >> 8) & 0xff),
      v = b(n & 0xff);
    return `#${((r << 16) | (g << 8) | v).toString(16).padStart(6, '0')}`;
  }
  function darken(hex: string) {
    const n = parseInt(hex.replace('#', ''), 16);
    const d = (c: number) => Math.max(0, c - 50);
    const r = d((n >> 16) & 0xff),
      g = d((n >> 8) & 0xff),
      v = d(n & 0xff);
    return `#${((r << 16) | (g << 8) | v).toString(16).padStart(6, '0')}`;
  }
  function edgeStroke(type: string, sel: boolean) {
    if (sel) return '#2563eb';
    return type === 'thick' ? '#1e40af' : '#64748b';
  }

  function focusInput(node: HTMLElement) {
    node.focus();
    (node as HTMLInputElement).select?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-900"
  role="application"
  tabindex="0"
  onkeydown={onKeydown}>
  <!-- ── Toolbar ──────────────────────────────────────────────────── -->
  <div
    class="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
    <!-- Node dropdown -->
    <div
      class="relative"
      use:clickOutside={() => {
        showNodeDropdown = false;
      }}>
      <button
        class={[
          'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
          addNodeMode
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
        ].join(' ')}
        onclick={() => {
          if (addNodeMode && !showNodeDropdown) {
            addNodeMode = false;
            return;
          }
          showNodeDropdown = !showNodeDropdown;
          connectSource = null;
          ghostNode = null;
        }}
        title="Add node — click canvas to place">
        + Node
        <svg width="8" height="5" viewBox="0 0 8 5" class="ml-0.5 opacity-50">
          <path
            d="M0.5 0.5l3.5 4 3.5-4"
            stroke="currentColor"
            fill="none"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round" />
        </svg>
      </button>

      {#if showNodeDropdown}
        <div
          class="absolute top-full left-0 z-50 mt-1 flex gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {#each SHAPES as s (s.shape)}
            <button
              class={[
                'flex flex-col items-center gap-1 rounded-lg px-2 py-2 transition-colors hover:bg-blue-50 dark:hover:bg-slate-700',
                nextShape === s.shape && addNodeMode
                  ? 'bg-blue-50 ring-1 ring-blue-300 dark:bg-slate-700'
                  : ''
              ].join(' ')}
              onclick={() => selectShape(s.shape)}
              title={s.title}>
              <svg
                width="34"
                height="26"
                viewBox="0 0 34 26"
                class="text-slate-600 dark:text-slate-300">
                {#if s.shape === 'diamond'}
                  <polygon
                    points="17,2 32,13 17,24 2,13"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5" />
                {:else if s.shape === 'circle'}
                  <ellipse
                    cx="17"
                    cy="13"
                    rx="13"
                    ry="10"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5" />
                {:else if s.shape === 'rect'}
                  <rect
                    x="1"
                    y="5"
                    width="32"
                    height="16"
                    rx="2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5" />
                {:else if s.shape === 'rounded'}
                  <rect
                    x="1"
                    y="5"
                    width="32"
                    height="16"
                    rx="6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5" />
                {:else}
                  <rect
                    x="1"
                    y="5"
                    width="32"
                    height="16"
                    rx="8"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5" />
                {/if}
              </svg>
              <span class="text-[10px] text-slate-500 dark:text-slate-400"
                >{s.title.split(' ')[0]}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <button
      class={[
        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
        connectSource
          ? 'bg-blue-600 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
      ].join(' ')}
      onclick={() => {
        connectSource = selectedId ?? '__pick__';
        ghostNode = null;
        addNodeMode = false;
      }}
      title="Draw an edge between two nodes">
      {connectSource ? '→ click target' : '⤳ Edge'}</button>

    <button
      class="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
      onclick={cycleDirection}>{graph?.direction ?? 'TD'}</button>

    <button
      class="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
      onclick={resetLayout}>⊞ Layout</button>

    {#if selectedId}
      <button
        class="rounded bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
        onclick={deleteSelected}>🗑 Delete</button>
    {/if}

    {#if selectedNode}
      <div class="ml-1 flex items-center gap-1">
        <span class="text-xs text-slate-400">Color:</span>
        {#each COLORS as c (c.value)}
          <button
            class={[
              'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
              selectedNode.color === (c.value || undefined)
                ? 'scale-110 border-blue-500'
                : 'border-slate-300 dark:border-slate-500'
            ].join(' ')}
            style={c.value ? `background:${c.value}` : 'background:white'}
            onclick={() => setNodeColor(c.value)}
            title={c.label}></button>
        {/each}
      </div>
    {/if}

    <div class="ml-auto text-xs text-slate-400">
      {#if ghostNode}Click para colocar · Esc para cancelar
      {:else if addNodeMode}Click en el canvas para agregar nodo
      {:else if connectSource === '__pick__'}Click en el nodo origen
      {:else if connectSource}Click en el nodo destino
      {:else}Drag · doble-click para editar · click en nodo para opciones rápidas{/if}
    </div>
  </div>

  <!-- ── Canvas SVG ───────────────────────────────────────────────── -->
  <svg
    bind:this={svgEl}
    class="h-full w-full select-none"
    class:cursor-crosshair={addNodeMode || !!ghostNode || !!connectSource}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmousedown={onSvgMouseDown}
    onclick={onSvgClick}
    onwheel={onWheel}>
    <defs>
      <!-- Arrow markers -->
      <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"
        ><path d="M0,0 L0,6 L8,3z" fill="#64748b" /></marker>
      <marker id="arr-sel" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"
        ><path d="M0,0 L0,6 L8,3z" fill="#2563eb" /></marker>
      <marker id="arr-thk" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"
        ><path d="M0,0 L0,6 L8,3z" fill="#1e40af" /></marker>

      <!-- Drop shadow for selected nodes -->
      <filter id="sel-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#2563eb" flood-opacity="0.45" />
      </filter>
      <!-- Soft shadow for panels -->
      <filter id="panel-shadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.15" />
      </filter>

      <!-- Dot grid -->
      <pattern
        id="grid"
        width="24"
        height="24"
        patternUnits="userSpaceOnUse"
        patternTransform={`translate(${pan.x % 24},${pan.y % 24}) scale(${scale})`}>
        <circle cx="0" cy="0" r="1.2" fill="#c8d3de" />
      </pattern>
    </defs>

    <rect class="canvas-bg" width="100%" height="100%" fill="url(#grid)" />

    <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
      <!-- ── Edges ──────────────────────────────────────────────────── -->
      {#if graph}
        {#each graph.edges as edge (edge.id)}
          {@const sp = positions.get(edge.source)}
          {@const tp = positions.get(edge.target)}
          {#if sp && tp}
            {@const d = edgePath(edge)}
            {@const mid = edgeMid(edge)}
            {@const sel = selectedId === edge.id}
            {@const isEditingEdge = editingEdge?.id === edge.id}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <g
              onclick={(e) => onEdgeClick(e, edge.id)}
              ondblclick={(e) => onEdgeDblClick(e, edge.id)}>
              <path {d} fill="none" stroke="transparent" stroke-width="12" class="cursor-pointer" />
              <path
                {d}
                fill="none"
                stroke={edgeStroke(edge.type, sel)}
                stroke-width={edge.type === 'thick' ? 3 : 1.5}
                stroke-dasharray={edge.type === 'dotted' ? '6 3' : 'none'}
                marker-end={sel
                  ? 'url(#arr-sel)'
                  : edge.type === 'thick'
                    ? 'url(#arr-thk)'
                    : 'url(#arr)'} />

              {#if isEditingEdge}
                <foreignObject x={mid.x - 70} y={mid.y - 14} width="140" height="28">
                  <input
                    class="h-full w-full rounded border border-blue-400 bg-white px-2 text-center text-xs shadow outline-none dark:bg-slate-700 dark:text-white"
                    value={editingEdge.value}
                    oninput={(e) => {
                      if (editingEdge) editingEdge.value = (e.target as HTMLInputElement).value;
                    }}
                    onkeydown={onEdgeLabelKey}
                    onblur={commitEdgeLabel}
                    use:focusInput />
                </foreignObject>
              {:else if edge.label}
                {@const lw = edge.label.length * 7 + 16}
                <rect
                  x={mid.x - lw / 2}
                  y={mid.y - 11}
                  width={lw}
                  height={22}
                  rx="4"
                  fill="white"
                  stroke="#e2e8f0"
                  stroke-width="1"
                  class="dark:fill-slate-800" />
                <text
                  x={mid.x}
                  y={mid.y + 4}
                  text-anchor="middle"
                  font-size="11"
                  fill={sel ? '#1d4ed8' : '#475569'}
                  class="pointer-events-none dark:fill-slate-300">{edge.label}</text>
              {:else if sel}
                <text
                  x={mid.x}
                  y={mid.y - 6}
                  text-anchor="middle"
                  font-size="10"
                  fill="#94a3b8"
                  class="pointer-events-none">doble-click para etiquetar</text>
              {/if}
            </g>
          {/if}
        {/each}

        <!-- ── Nodes ───────────────────────────────────────────────── -->
        {#each graph.nodes as node (node.id)}
          {@const pos = positions.get(node.id) ?? { x: 0, y: 0 }}
          {@const dims = getNodeDims(node)}
          {@const sel = selectedId === node.id}
          {@const fill = nodeFill(node, sel)}
          {@const stroke = nodeStroke(node, sel)}
          {@const sw = sel ? 2.5 : 1.5}
          <g
            transform={`translate(${pos.x},${pos.y})`}
            class="cursor-grab active:cursor-grabbing"
            class:cursor-crosshair={!!connectSource || !!ghostNode}
            filter={sel ? 'url(#sel-glow)' : undefined}
            onmousedown={(e) => startDrag(e, node.id)}
            onmouseup={(e) => onNodeMouseUp(e, node.id)}
            onclick={(e) => onNodeClick(e, node.id)}
            ondblclick={(e) => onNodeDblClick(e, node.id)}>
            {#if node.shape === 'diamond'}
              {@const hw = dims.w / 2}
              {@const hh = dims.h / 2}
              <polygon
                points={`${hw},0 ${dims.w},${hh} ${hw},${dims.h} 0,${hh}`}
                {fill}
                {stroke}
                stroke-width={sw} />
            {:else if node.shape === 'circle'}
              <ellipse
                cx={dims.w / 2}
                cy={dims.h / 2}
                rx={dims.w / 2}
                ry={dims.h / 2}
                {fill}
                {stroke}
                stroke-width={sw} />
            {:else}
              <rect
                width={dims.w}
                height={dims.h}
                rx={node.shape === 'stadium' ? dims.h / 2 : node.shape === 'rounded' ? 14 : 5}
                {fill}
                {stroke}
                stroke-width={sw} />
            {/if}

            {#if editingNode?.id === node.id}
              <foreignObject x="8" y={(dims.h - 28) / 2} width={dims.w - 16} height="28">
                <input
                  class="h-full w-full rounded border border-blue-400 bg-white px-2 text-center text-sm outline-none dark:bg-slate-700 dark:text-white"
                  value={editingNode.value}
                  oninput={(e) => {
                    if (editingNode) editingNode.value = (e.target as HTMLInputElement).value;
                  }}
                  onkeydown={onNodeLabelKey}
                  onblur={commitNodeLabel}
                  use:focusInput />
              </foreignObject>
            {:else}
              <text
                x={dims.w / 2}
                y={dims.h / 2}
                text-anchor="middle"
                dominant-baseline="central"
                font-size="13"
                font-family="system-ui,sans-serif"
                fill={sel ? '#1e40af' : '#1e293b'}
                class="pointer-events-none select-none">{node.label}</text>
            {/if}

            <!-- Connect target ring -->
            {#if connectSource && connectSource !== '__pick__' && connectSource !== node.id}
              <rect
                x="-5"
                y="-5"
                width={dims.w + 10}
                height={dims.h + 10}
                rx="10"
                fill="none"
                stroke="#3b82f6"
                stroke-width="2"
                stroke-dasharray="5 3"
                class="pointer-events-none" />
            {/if}
          </g>
        {/each}

        <!-- ── Quick-add panel (below selected node) ──────────────── -->
        {#if selectedId && !ghostNode && !editingNode && !connectSource && !addNodeMode}
          {@const selNode = graph.nodes.find((n) => n.id === selectedId)}
          {#if selNode}
            {@const pos = getNodePos(selectedId)}
            {@const dims = getNodeDims(selNode)}
            {@const btnW = 38}
            {@const btnH = 38}
            {@const gap = 6}
            {@const panW = SHAPES.length * (btnW + gap) - gap + 24}
            {@const panH = btnH + 20}
            {@const panX = pos.x + dims.w / 2 - panW / 2}
            {@const panY = pos.y + dims.h + 16}

            <!-- Panel background -->
            <rect
              x={panX}
              y={panY}
              width={panW}
              height={panH}
              rx="10"
              fill="white"
              stroke="#e2e8f0"
              stroke-width="1"
              filter="url(#panel-shadow)"
              class="dark:fill-slate-800 dark:stroke-slate-600" />

            <!-- Label -->
            <text
              x={panX + panW / 2}
              y={panY + 10}
              text-anchor="middle"
              font-size="9"
              fill="#94a3b8"
              class="pointer-events-none select-none">Agregar y conectar</text>

            <!-- Shape buttons -->
            {#each SHAPES as s, i (s.shape)}
              {@const bx = panX + 12 + i * (btnW + gap)}
              {@const by = panY + 14}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <g
                onclick={(e) => {
                  e.stopPropagation();
                  startGhostNode(s.shape);
                }}
                class="cursor-pointer">
                <rect
                  x={bx}
                  y={by}
                  width={btnW}
                  height={btnH}
                  rx="7"
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                  stroke-width="1"
                  class="dark:fill-slate-700 dark:stroke-slate-500" />

                <!-- Shape miniature -->
                {#if s.shape === 'diamond'}
                  <polygon
                    points={`${bx + btnW / 2},${by + 4} ${bx + btnW - 4},${by + btnH / 2} ${bx + btnW / 2},${by + btnH - 4} ${bx + 4},${by + btnH / 2}`}
                    fill="none"
                    stroke="#64748b"
                    stroke-width="1.5"
                    class="pointer-events-none" />
                {:else if s.shape === 'circle'}
                  <ellipse
                    cx={bx + btnW / 2}
                    cy={by + btnH / 2}
                    rx={btnW / 2 - 5}
                    ry={btnH / 2 - 5}
                    fill="none"
                    stroke="#64748b"
                    stroke-width="1.5"
                    class="pointer-events-none" />
                {:else}
                  {@const rx2 =
                    s.shape === 'stadium' ? (btnH - 10) / 2 : s.shape === 'rounded' ? 7 : 3}
                  <rect
                    x={bx + 5}
                    y={by + 8}
                    width={btnW - 10}
                    height={btnH - 16}
                    rx={rx2}
                    fill="none"
                    stroke="#64748b"
                    stroke-width="1.5"
                    class="pointer-events-none" />
                {/if}

                <!-- Hover highlight (invisible rect for pointer area) -->
                <rect
                  x={bx}
                  y={by}
                  width={btnW}
                  height={btnH}
                  rx="7"
                  fill="transparent"
                  class="hover:fill-blue-50" />
              </g>
            {/each}
          {/if}
        {/if}
      {/if}

      <!-- ── Ghost node preview ───────────────────────────────────── -->
      {#if ghostNode && graph}
        {@const srcPos = positions.get(ghostNode.sourceId)}
        {@const srcNode = graph.nodes.find((n) => n.id === ghostNode?.sourceId)}
        {@const gDims = getNodeDims({ label: 'nuevo', shape: ghostNode.shape })}
        {@const gx = mousePos.x - gDims.w / 2}
        {@const gy = mousePos.y - gDims.h / 2}

        {#if srcPos && srcNode}
          {@const sc = nodeCenter(ghostNode.sourceId)}
          <!-- Dashed line from source to ghost -->
          <line
            x1={sc.x}
            y1={sc.y}
            x2={mousePos.x}
            y2={mousePos.y}
            stroke="#2563eb"
            stroke-width="1.5"
            stroke-dasharray="6 3"
            marker-end="url(#arr-sel)"
            class="pointer-events-none" />
        {/if}

        <!-- Ghost shape -->
        <g opacity="0.6" class="pointer-events-none" transform={`translate(${gx},${gy})`}>
          {#if ghostNode.shape === 'diamond'}
            {@const hw = gDims.w / 2}
            {@const hh = gDims.h / 2}
            <polygon
              points={`${hw},0 ${gDims.w},${hh} ${hw},${gDims.h} 0,${hh}`}
              fill="#dbeafe"
              stroke="#2563eb"
              stroke-width="2"
              stroke-dasharray="5 3" />
          {:else if ghostNode.shape === 'circle'}
            <ellipse
              cx={gDims.w / 2}
              cy={gDims.h / 2}
              rx={gDims.w / 2}
              ry={gDims.h / 2}
              fill="#dbeafe"
              stroke="#2563eb"
              stroke-width="2"
              stroke-dasharray="5 3" />
          {:else}
            <rect
              width={gDims.w}
              height={gDims.h}
              rx={ghostNode.shape === 'stadium'
                ? gDims.h / 2
                : ghostNode.shape === 'rounded'
                  ? 14
                  : 5}
              fill="#dbeafe"
              stroke="#2563eb"
              stroke-width="2"
              stroke-dasharray="5 3" />
          {/if}
          <text
            x={gDims.w / 2}
            y={gDims.h / 2}
            text-anchor="middle"
            dominant-baseline="central"
            font-size="12"
            fill="#1e40af">nuevo</text>
        </g>
      {/if}

      <!-- Classic connect line -->
      {#if connectSource && connectSource !== '__pick__' && positions.has(connectSource)}
        {@const sc = nodeCenter(connectSource)}
        <line
          x1={sc.x}
          y1={sc.y}
          x2={mousePos.x}
          y2={mousePos.y}
          stroke="#2563eb"
          stroke-width="1.5"
          stroke-dasharray="6 3"
          marker-end="url(#arr-sel)"
          class="pointer-events-none" />
      {/if}
    </g>
  </svg>
</div>
