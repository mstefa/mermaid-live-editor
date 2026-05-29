<script lang="ts">
  import type { ArrowType, SequenceDiagram } from '$lib/types/sequence';
  import { sequenceToModel } from '$lib/util/sequenceParser';
  import { modelToSequence } from '$lib/util/sequenceSerializer';
  import { untrack } from 'svelte';

  interface Props {
    code: string;
    oncodechange: (code: string) => void;
  }
  const { code, oncodechange }: Props = $props();

  // ── Layout constants ────────────────────────────────────────────────
  const COL_W = 140; // participant box width
  const COL_H = 44; // participant box height
  const COL_GAP = 200; // distance between participant centers
  const ML = 60; // left margin (first participant center x)
  const MT = 30; // top margin
  const MSG_H = 56; // vertical space per message
  const SELF_W = 48; // width of self-message loop
  const TAIL = 70; // lifeline extension below last message

  // ── State ───────────────────────────────────────────────────────────
  let diagram = $state<SequenceDiagram | null>(null);
  let lastCode = $state('');

  $effect(() => {
    if (code === lastCode) return;
    const parsed = sequenceToModel(code);
    untrack(() => {
      if (parsed) diagram = parsed;
    });
  });

  let svgEl = $state<SVGSVGElement | undefined>();
  let pan = $state({ x: 40, y: 40 });
  let scale = $state(1);
  let isPanning = $state(false);
  let panStart = $state({ mx: 0, my: 0, px: 0, py: 0 });

  let selectedId = $state<string | null>(null); // participant or message id
  let connectingFrom = $state<string | null>(null); // participant id for new message
  let nextArrow = $state<ArrowType>('->>');
  let editingParticipant = $state<{ id: string; value: string } | null>(null);
  let editingMessage = $state<{ id: string; value: string } | null>(null);

  // Drag-to-reorder participants (horizontal)
  let dragPart = $state<{ id: string; startClientX: number } | null>(null);
  let dragOverIdx = $state<number>(-1);
  let partDragMoved = $state(false);

  // Drag-to-reorder messages (vertical)
  let dragMsgId = $state<string | null>(null);
  let dragMsgSlot = $state<number>(-1); // insertion slot (0 = before first)
  let msgDragMoved = $state(false);

  const ARROW_OPTIONS: { value: ArrowType; label: string; title: string }[] = [
    { value: '->', label: '→', title: 'Solid, open' },
    { value: '->>', label: '-»', title: 'Solid, filled' },
    { value: '-->', label: '⇢', title: 'Dotted, open' },
    { value: '-->>', label: '--»', title: 'Dotted, filled' },
    { value: '-x', label: '→✕', title: 'Solid, cross' }
  ];

  // ── Helpers ─────────────────────────────────────────────────────────
  function emitCode() {
    if (!diagram) return;
    const c = modelToSequence(diagram);
    lastCode = c;
    oncodechange(c);
  }

  function partIdx(id: string) {
    return diagram?.participants.findIndex((p) => p.id === id) ?? -1;
  }

  function partCX(id: string) {
    return ML + partIdx(id) * COL_GAP;
  }

  function msgY(idx: number) {
    return MT + COL_H + MSG_H * idx + MSG_H * 0.55;
  }

  function lifelineEnd() {
    const n = diagram?.messages.length ?? 0;
    return MT + COL_H + MSG_H * n + TAIL;
  }

  function screenToCanvas(sx: number, sy: number) {
    if (!svgEl) return { x: 0, y: 0 };
    const r = svgEl.getBoundingClientRect();
    return { x: (sx - r.left - pan.x) / scale, y: (sy - r.top - pan.y) / scale };
  }

  // Which participant slot index a canvas x corresponds to
  function slotAtX(canvasX: number): number {
    if (!diagram) return 0;
    const n = diagram.participants.length;
    const raw = Math.round((canvasX - ML) / COL_GAP);
    return Math.max(0, Math.min(n - 1, raw));
  }

  // Which insertion slot (0 = before first message) a canvas y corresponds to
  function insertionSlotAtY(canvasY: number): number {
    const n = diagram?.messages.length ?? 0;
    // Boundaries are at MT + COL_H + i * MSG_H for i in [0..n]
    let best = 0,
      bestDist = Infinity;
    for (let i = 0; i <= n; i++) {
      const slotY = MT + COL_H + i * MSG_H;
      const dist = Math.abs(canvasY - slotY);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  // Y of the insertion line for slot i
  function insertionLineY(slot: number): number {
    return MT + COL_H + slot * MSG_H;
  }

  // ── Mouse handlers ───────────────────────────────────────────────────
  const DRAG_THRESHOLD = 6; // px before we consider it a drag

  function onMouseMove(e: MouseEvent) {
    const cp = screenToCanvas(e.clientX, e.clientY);
    if (isPanning) {
      pan = {
        x: panStart.px + (e.clientX - panStart.mx),
        y: panStart.py + (e.clientY - panStart.my)
      };
    }
    if (dragPart) {
      if (Math.abs(e.clientX - dragPart.startClientX) > DRAG_THRESHOLD) partDragMoved = true;
      if (partDragMoved) dragOverIdx = slotAtX(cp.x);
    }
    if (dragMsgId) {
      msgDragMoved = true;
      dragMsgSlot = insertionSlotAtY(cp.y);
    }
  }

  function onMouseUp() {
    isPanning = false;

    // Commit participant drag
    if (dragPart && diagram) {
      if (partDragMoved) {
        const fromIdx = partIdx(dragPart.id);
        const toIdx = dragOverIdx;
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          const parts = [...diagram.participants];
          const [moved] = parts.splice(fromIdx, 1);
          parts.splice(toIdx, 0, moved);
          diagram = { ...diagram, participants: parts };
          emitCode();
        }
      }
      dragPart = null;
      dragOverIdx = -1;
      partDragMoved = false;
    }

    // Commit message drag
    if (dragMsgId && diagram) {
      if (msgDragMoved) {
        const fromIdx = diagram.messages.findIndex((m) => m.id === dragMsgId);
        if (fromIdx !== -1 && dragMsgSlot !== fromIdx && dragMsgSlot !== fromIdx + 1) {
          const msgs = [...diagram.messages];
          const [moved] = msgs.splice(fromIdx, 1);
          // After removing fromIdx, adjust slot if needed
          const insertAt = dragMsgSlot > fromIdx ? dragMsgSlot - 1 : dragMsgSlot;
          msgs.splice(insertAt, 0, moved);
          diagram = { ...diagram, messages: msgs };
          emitCode();
        }
      }
      dragMsgId = null;
      dragMsgSlot = -1;
      msgDragMoved = false;
    }
  }

  function onSvgMouseDown(e: MouseEvent) {
    const tgt = e.target as SVGElement;
    const isCanvas = tgt.tagName === 'svg' || tgt.classList.contains('canvas-bg');
    if (isCanvas) {
      if (e.button === 1 || e.altKey) {
        e.preventDefault();
        isPanning = true;
        panStart = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
      } else {
        selectedId = null;
        connectingFrom = null;
        editingParticipant = null;
        editingMessage = null;
      }
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    scale = Math.min(3, Math.max(0.15, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
  }

  // True when the selected element is a participant (not a message)
  let selectedParticipantId = $derived(
    diagram?.participants.find((p) => p.id === selectedId)?.id ?? null
  );

  // Click on a participant header
  function onPartClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (partDragMoved) return; // was a drag, not a click

    // Explicit connect mode takes priority
    if (connectingFrom && connectingFrom !== id) {
      addMessage(connectingFrom, id);
      connectingFrom = null;
      return;
    }
    if (connectingFrom === id) {
      connectingFrom = null;
      return;
    }

    // If another participant is already active → create message directly
    if (selectedParticipantId && selectedParticipantId !== id) {
      addMessage(selectedParticipantId, id);
      return;
    }

    // Otherwise just select this participant
    selectedId = id;
    editingMessage = null;
  }

  function onPartDblClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    const p = diagram?.participants.find((p) => p.id === id);
    if (p) {
      editingParticipant = { id, value: p.label };
      selectedId = id;
    }
  }

  function onPartMouseDown(e: MouseEvent, id: string) {
    if (e.button === 0 && !connectingFrom) {
      dragPart = { id, startClientX: e.clientX };
      dragOverIdx = partIdx(id);
      partDragMoved = false;
    }
  }

  function onMsgMouseDown(e: MouseEvent, id: string) {
    if (e.button === 0 && !editingMessage) {
      e.stopPropagation();
      dragMsgId = id;
      dragMsgSlot = diagram?.messages.findIndex((m) => m.id === id) ?? 0;
      msgDragMoved = false;
    }
  }

  function onMsgClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (msgDragMoved) return; // was a drag, not a click
    selectedId = id;
    editingMessage = null;
  }

  function onMsgDblClick(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (msgDragMoved) return;
    const m = diagram?.messages.find((m) => m.id === id);
    if (m) {
      editingMessage = { id, value: m.label };
      selectedId = id;
    }
  }

  function commitParticipantLabel() {
    if (!editingParticipant || !diagram) return;
    const ep = editingParticipant;
    const idx = diagram.participants.findIndex((p) => p.id === ep.id);
    if (idx !== -1) {
      diagram.participants[idx] = { ...diagram.participants[idx], label: ep.value };
      diagram = { ...diagram };
      emitCode();
    }
    editingParticipant = null;
  }

  function commitMessageLabel() {
    if (!editingMessage || !diagram) return;
    const em = editingMessage;
    const idx = diagram.messages.findIndex((m) => m.id === em.id);
    if (idx !== -1) {
      diagram.messages[idx] = { ...diagram.messages[idx], label: em.value };
      diagram = { ...diagram };
      emitCode();
    }
    editingMessage = null;
  }

  function onPartLabelKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitParticipantLabel();
    }
    if (e.key === 'Escape') editingParticipant = null;
  }

  function onMsgLabelKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitMessageLabel();
    }
    if (e.key === 'Escape') editingMessage = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      connectingFrom = null;
      selectedId = null;
      editingParticipant = null;
      editingMessage = null;
    }
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      selectedId &&
      !editingParticipant &&
      !editingMessage
    ) {
      deleteSelected();
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────
  function addParticipant() {
    if (!diagram) diagram = { participants: [], messages: [] };
    let n = 1;
    while (diagram.participants.find((p) => p.id === `P${n}`)) n++;
    const id = `P${n}`;
    diagram = {
      ...diagram,
      participants: [...diagram.participants, { id, label: id, type: 'participant' }]
    };
    emitCode();
    editingParticipant = { id, value: id };
    selectedId = id;
  }

  function addMessage(from: string, to: string) {
    if (!diagram) return;
    const id = `m${Date.now()}`;
    diagram = {
      ...diagram,
      messages: [...diagram.messages, { arrow: nextArrow, from, id, label: '', to }]
    };
    emitCode();
    // Open label editor for the new message
    editingMessage = { id, value: '' };
    selectedId = id;
  }

  function deleteSelected() {
    if (!selectedId || !diagram) return;
    if (diagram.messages.find((m) => m.id === selectedId)) {
      diagram = { ...diagram, messages: diagram.messages.filter((m) => m.id !== selectedId) };
    } else if (diagram.participants.find((p) => p.id === selectedId)) {
      const pid = selectedId;
      diagram = {
        ...diagram,
        participants: diagram.participants.filter((p) => p.id !== pid),
        messages: diagram.messages.filter((m) => m.from !== pid && m.to !== pid)
      };
    }
    selectedId = null;
    emitCode();
  }

  // Change arrow type of selected message
  function setArrowType(arrow: ArrowType) {
    nextArrow = arrow;
    if (!selectedId || !diagram) return;
    const idx = diagram.messages.findIndex((m) => m.id === selectedId);
    if (idx !== -1) {
      diagram.messages[idx] = { ...diagram.messages[idx], arrow };
      diagram = { ...diagram };
      emitCode();
    }
  }

  // Derived: selected message (to show its arrow type in toolbar)
  let selectedMessage = $derived(diagram?.messages.find((m) => m.id === selectedId) ?? null);

  // Arrow marker generation
  function arrowDash(a: ArrowType) {
    return a.startsWith('--') ? '6 3' : 'none';
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
  <!-- ── Toolbar ────────────────────────────────────────────────────── -->
  <div
    class="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
    <button
      class="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
      onclick={addParticipant}>+ Participante</button>

    <button
      class={[
        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
        connectingFrom
          ? 'bg-blue-600 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
      ].join(' ')}
      onclick={() => {
        connectingFrom = selectedId ?? null;
        editingParticipant = null;
      }}
      title="Seleccioná un participante origen, luego click en el destino">
      {connectingFrom ? '→ click destino' : '⤳ Mensaje'}</button>

    <!-- Arrow type selector -->
    <div
      class="flex items-center gap-0.5 rounded-md border border-slate-200 p-0.5 dark:border-slate-600">
      {#each ARROW_OPTIONS as opt (opt.value)}
        <button
          class={[
            'rounded px-2 py-1 font-mono text-xs transition-colors',
            (selectedMessage?.arrow ?? nextArrow) === opt.value
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
          ].join(' ')}
          onclick={() => setArrowType(opt.value)}
          title={opt.title}>{opt.label}</button>
      {/each}
    </div>

    {#if selectedId}
      <button
        class="rounded bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
        onclick={deleteSelected}>🗑 Eliminar</button>
    {/if}

    <div class="ml-auto text-xs text-slate-400">
      {#if connectingFrom}Click en el participante destino
      {:else if selectedParticipantId}Click en otro participante para agregar mensaje · Esc para
        deseleccionar
      {:else}Click en participante para activarlo · Doble-click para editar nombre · Drag para
        reordenar{/if}
    </div>
  </div>

  <!-- ── Canvas ────────────────────────────────────────────────────── -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    bind:this={svgEl}
    class="h-full w-full select-none"
    class:cursor-crosshair={!!connectingFrom}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmousedown={onSvgMouseDown}
    onwheel={onWheel}>
    <defs>
      <!-- Filled arrowhead -->
      <marker id="arr-filled" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"
        ><polygon points="0 0, 9 3.5, 0 7" fill="#64748b" /></marker>
      <marker id="arr-filled-sel" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"
        ><polygon points="0 0, 9 3.5, 0 7" fill="#2563eb" /></marker>
      <!-- Open arrowhead -->
      <marker id="arr-open" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"
        ><path d="M0,0 L9,4 L0,8" fill="none" stroke="#64748b" stroke-width="1.5" /></marker>
      <marker id="arr-open-sel" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"
        ><path d="M0,0 L9,4 L0,8" fill="none" stroke="#2563eb" stroke-width="1.5" /></marker>
      <!-- X head -->
      <marker id="arr-x" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"
        ><path d="M1,1 L7,7 M7,1 L1,7" stroke="#64748b" stroke-width="1.5" /></marker>
      <marker id="arr-x-sel" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"
        ><path d="M1,1 L7,7 M7,1 L1,7" stroke="#2563eb" stroke-width="1.5" /></marker>

      <!-- Panel shadow -->
      <filter id="pshadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.12" />
      </filter>
      <!-- Selection glow -->
      <filter id="sel-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#2563eb" flood-opacity="0.4" />
      </filter>

      <!-- Dot grid -->
      <pattern
        id="seqgrid"
        width="24"
        height="24"
        patternUnits="userSpaceOnUse"
        patternTransform={`translate(${pan.x % 24},${pan.y % 24}) scale(${scale})`}>
        <circle cx="0" cy="0" r="1.2" fill="#c8d3de" />
      </pattern>
    </defs>

    <rect class="canvas-bg" width="100%" height="100%" fill="url(#seqgrid)" />

    <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
      {#if diagram}
        {@const llEnd = lifelineEnd()}

        <!-- ── Lifelines ───────────────────────────────────────── -->
        {#each diagram.participants as p (p.id)}
          {@const cx = partCX(p.id)}
          <line
            x1={cx}
            y1={MT + COL_H}
            x2={cx}
            y2={llEnd}
            stroke="#cbd5e1"
            stroke-width="1.5"
            stroke-dasharray="6 4"
            class="pointer-events-none dark:stroke-slate-600" />
        {/each}

        <!-- ── Messages ───────────────────────────────────────── -->
        {#each diagram.messages as msg, mi (msg.id)}
          {@const sel = selectedId === msg.id}
          {@const y = msgY(mi)}
          {@const x1 = partCX(msg.from)}
          {@const x2 = partCX(msg.to)}
          {@const self = msg.from === msg.to}
          {@const isEditingMsg = editingMessage?.id === msg.id}
          {@const markerId = sel
            ? msg.arrow === '->>' || msg.arrow === '-->>'
              ? 'arr-filled-sel'
              : msg.arrow === '-x' || msg.arrow === '--x'
                ? 'arr-x-sel'
                : 'arr-open-sel'
            : msg.arrow === '->>' || msg.arrow === '-->>'
              ? 'arr-filled'
              : msg.arrow === '-x' || msg.arrow === '--x'
                ? 'arr-x'
                : 'arr-open'}

          {@const lx = self ? x1 + SELF_W + 6 : (x1 + x2) / 2}
          {@const ly = self ? y + 12 : y - 7}

          {@const isDraggingThis = dragMsgId === msg.id}

          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <g
            onclick={(e) => onMsgClick(e, msg.id)}
            ondblclick={(e) => onMsgDblClick(e, msg.id)}
            onmousedown={(e) => onMsgMouseDown(e, msg.id)}
            opacity={isDraggingThis ? 0.35 : 1}
            class="cursor-grab active:cursor-grabbing"
            filter={sel && !isDraggingThis ? 'url(#sel-glow)' : undefined}>
            {#if self}
              <!-- Self-loop -->
              <path
                d={`M ${x1},${y} L ${x1 + SELF_W},${y} L ${x1 + SELF_W},${y + 24} L ${x1},${y + 24}`}
                fill="none"
                stroke={sel ? '#2563eb' : '#64748b'}
                stroke-width={sel ? 2 : 1.5}
                stroke-dasharray={arrowDash(msg.arrow)}
                marker-end={`url(#${markerId})`}
                class="cursor-pointer" />
              <!-- hit area -->
              <path
                d={`M ${x1},${y} L ${x1 + SELF_W},${y} L ${x1 + SELF_W},${y + 24} L ${x1},${y + 24}`}
                fill="none"
                stroke="transparent"
                stroke-width="10"
                class="cursor-pointer" />
            {:else}
              <!-- Normal message -->
              <line
                {x1}
                y1={y}
                {x2}
                y2={y}
                stroke={sel ? '#2563eb' : '#64748b'}
                stroke-width={sel ? 2 : 1.5}
                stroke-dasharray={arrowDash(msg.arrow)}
                marker-end={`url(#${markerId})`}
                class="cursor-pointer" />
              <!-- hit area -->
              <line
                {x1}
                y1={y}
                {x2}
                y2={y}
                stroke="transparent"
                stroke-width="12"
                class="cursor-pointer" />
            {/if}

            <!-- Label or editor -->
            {#if isEditingMsg}
              <foreignObject x={lx - 80} y={ly - 14} width="160" height="28">
                <input
                  class="h-full w-full rounded border border-blue-400 bg-white px-2 text-center text-xs shadow outline-none dark:bg-slate-700 dark:text-white"
                  value={editingMessage.value}
                  oninput={(e) => {
                    if (editingMessage) editingMessage.value = (e.target as HTMLInputElement).value;
                  }}
                  onkeydown={onMsgLabelKey}
                  onblur={commitMessageLabel}
                  use:focusInput />
              </foreignObject>
            {:else if msg.label}
              {@const lw = msg.label.length * 7 + 16}
              <rect
                x={lx - lw / 2}
                y={ly - 12}
                width={lw}
                height={20}
                rx="4"
                fill="white"
                stroke="#e2e8f0"
                class="pointer-events-none dark:fill-slate-800 dark:stroke-slate-600" />
              <text
                x={lx}
                y={ly}
                text-anchor="middle"
                font-size="11"
                fill={sel ? '#1d4ed8' : '#475569'}
                class="pointer-events-none dark:fill-slate-300">{msg.label}</text>
            {:else if sel}
              <text
                x={lx}
                y={ly}
                text-anchor="middle"
                font-size="10"
                fill="#94a3b8"
                class="pointer-events-none">doble-click para etiquetar</text>
            {/if}
          </g>
        {/each}

        <!-- ── Message drag insertion line ───────────────────── -->
        {#if dragMsgId && msgDragMoved && dragMsgSlot >= 0}
          {@const ily = insertionLineY(dragMsgSlot)}
          {@const totalW = ML + (diagram.participants.length - 1) * COL_GAP + COL_W / 2 + 20}
          <line
            x1={ML - COL_W / 2}
            y1={ily}
            x2={totalW}
            y2={ily}
            stroke="#3b82f6"
            stroke-width="2.5"
            class="pointer-events-none" />
          <circle cx={ML - COL_W / 2} cy={ily} r="4" fill="#3b82f6" class="pointer-events-none" />
          <circle cx={totalW} cy={ily} r="4" fill="#3b82f6" class="pointer-events-none" />
        {/if}

        <!-- ── Participant boxes ───────────────────────────────── -->
        {#each diagram.participants as p, i (p.id)}
          {@const cx = ML + i * COL_GAP}
          {@const sel = selectedId === p.id}
          {@const isConn = connectingFrom === p.id}
          {@const isTarget =
            !!selectedParticipantId && selectedParticipantId !== p.id && !connectingFrom}
          {@const isDragTarget = dragPart && dragOverIdx === i && dragPart.id !== p.id}

          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g
            transform={`translate(${cx - COL_W / 2},${MT})`}
            class="cursor-pointer"
            filter={sel ? 'url(#sel-glow)' : undefined}
            onclick={(e) => onPartClick(e, p.id)}
            ondblclick={(e) => onPartDblClick(e, p.id)}
            onmousedown={(e) => onPartMouseDown(e, p.id)}>
            <rect
              width={COL_W}
              height={COL_H}
              rx="8"
              fill={isConn ? '#dbeafe' : sel ? '#eff6ff' : 'white'}
              stroke={sel || isConn
                ? '#2563eb'
                : isDragTarget
                  ? '#f59e0b'
                  : isTarget
                    ? '#60a5fa'
                    : '#94a3b8'}
              stroke-width={sel || isConn ? 2.5 : isTarget ? 2 : 1.5}
              stroke-dasharray={isTarget ? '5 3' : 'none'}
              class="dark:fill-slate-700 dark:stroke-slate-500" />

            <!-- Ring hint when this is a connectable target -->
            {#if isTarget}
              <rect
                x="-5"
                y="-5"
                width={COL_W + 10}
                height={COL_H + 10}
                rx="12"
                fill="none"
                stroke="#93c5fd"
                stroke-width="1.5"
                stroke-dasharray="4 3"
                class="pointer-events-none" />
            {/if}

            {#if editingParticipant?.id === p.id}
              <foreignObject x="8" y={(COL_H - 28) / 2} width={COL_W - 16} height="28">
                <input
                  class="h-full w-full rounded border border-blue-400 bg-white px-2 text-center text-sm outline-none dark:bg-slate-700 dark:text-white"
                  value={editingParticipant.value}
                  oninput={(e) => {
                    if (editingParticipant)
                      editingParticipant.value = (e.target as HTMLInputElement).value;
                  }}
                  onkeydown={onPartLabelKey}
                  onblur={commitParticipantLabel}
                  use:focusInput />
              </foreignObject>
            {:else}
              <text
                x={COL_W / 2}
                y={COL_H / 2}
                text-anchor="middle"
                dominant-baseline="central"
                font-size="13"
                font-family="system-ui,sans-serif"
                fill={sel || isConn ? '#1e40af' : '#1e293b'}
                class="pointer-events-none select-none">{p.label}</text>
            {/if}
          </g>

          <!-- Repeat participant box at bottom of lifeline -->
          <g transform={`translate(${cx - COL_W / 2},${llEnd})`} class="pointer-events-none">
            <rect
              width={COL_W}
              height={COL_H}
              rx="8"
              fill="white"
              stroke="#94a3b8"
              stroke-width="1.5"
              class="dark:fill-slate-700 dark:stroke-slate-500" />
            <text
              x={COL_W / 2}
              y={COL_H / 2}
              text-anchor="middle"
              dominant-baseline="central"
              font-size="13"
              font-family="system-ui,sans-serif"
              fill="#64748b"
              class="select-none">{p.label}</text>
          </g>
        {/each}

        <!-- Drop indicator while dragging -->
        {#if dragPart && dragOverIdx >= 0}
          {@const tx = ML + dragOverIdx * COL_GAP - COL_W / 2 - 4}
          <rect
            x={tx}
            y={MT - 4}
            width={COL_W + 8}
            height={llEnd - MT + COL_H + 8}
            rx="10"
            fill="none"
            stroke="#f59e0b"
            stroke-width="2"
            stroke-dasharray="6 3"
            class="pointer-events-none" />
        {/if}
      {:else}
        <!-- Empty state -->
        <text
          x="50%"
          y="50%"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="14"
          fill="#94a3b8">
          Importá un diagrama de secuencia o usá "+ Participante" para empezar
        </text>
      {/if}
    </g>
  </svg>
</div>
