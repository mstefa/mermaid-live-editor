<script lang="ts">
  import SequenceCanvas from '$/components/visual/SequenceCanvas.svelte';
  import VisualCanvas from '$/components/visual/VisualCanvas.svelte';
  import { mode } from 'mode-watcher';

  type DiagramMode = 'flowchart' | 'sequence';

  const DEFAULT_FLOWCHART = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[Car]`;

  const DEFAULT_SEQUENCE = `sequenceDiagram
    participant Alice
    participant Bob
    participant Server
    Alice->>Bob: Hola Bob!
    Bob->>Server: Request
    Server-->>Bob: Response
    Bob-->>Alice: Todo bien!`;

  let mode_ = $state<DiagramMode>('flowchart');
  let flowCode = $state(DEFAULT_FLOWCHART);
  let seqCode = $state(DEFAULT_SEQUENCE);

  let currentCode = $derived(mode_ === 'flowchart' ? flowCode : seqCode);

  let importText = $state('');
  let showImport = $state(false);
  let importError = $state('');
  let copied = $state(false);
  let isDark = $derived($mode === 'dark');

  function setMode(m: DiagramMode) {
    mode_ = m;
  }

  function openImport() {
    importText = '';
    importError = '';
    showImport = true;
  }

  function confirmImport() {
    const trimmed = importText.trim();
    if (!trimmed) {
      importError = 'Pegá código Mermaid primero.';
      return;
    }

    if (/^sequenceDiagram/i.test(trimmed)) {
      seqCode = trimmed;
      mode_ = 'sequence';
      showImport = false;
      return;
    }
    if (/^(flowchart|graph)\s/i.test(trimmed)) {
      flowCode = trimmed;
      mode_ = 'flowchart';
      showImport = false;
      return;
    }
    importError = 'Solo se soportan diagramas flowchart o sequenceDiagram.';
  }

  function cancelImport() {
    showImport = false;
    importError = '';
  }

  async function copyCode() {
    await navigator.clipboard.writeText(currentCode);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function toggleDark() {
    document.documentElement.classList.toggle('dark');
  }
</script>

<div class="flex h-full flex-col overflow-hidden bg-white dark:bg-slate-900">
  <!-- Header -->
  <header
    class="flex flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
    <span class="mr-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Mermaid</span>

    <!-- Mode tabs -->
    <div
      class="flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5 dark:border-slate-600">
      <button
        class={[
          'rounded-md px-3 py-1 text-xs font-medium transition-colors',
          mode_ === 'flowchart'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
        ].join(' ')}
        onclick={() => setMode('flowchart')}>
        ⬡ Flowchart
      </button>
      <button
        class={[
          'rounded-md px-3 py-1 text-xs font-medium transition-colors',
          mode_ === 'sequence'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
        ].join(' ')}
        onclick={() => setMode('sequence')}>
        ↔ Secuencia
      </button>
    </div>

    <div class="flex-1"></div>

    <button
      class="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
      onclick={openImport}>
      Importar
    </button>

    <button
      class={[
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        copied
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
      ].join(' ')}
      onclick={copyCode}>
      {copied ? '✓ Copiado' : 'Copiar código'}
    </button>

    <button
      class="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
      onclick={toggleDark}
      title="Toggle dark mode">
      {isDark ? '☀︎' : '☽'}
    </button>
  </header>

  <!-- Canvas -->
  <div class="flex-1 overflow-hidden">
    {#if mode_ === 'flowchart'}
      <VisualCanvas code={flowCode} oncodechange={(c) => (flowCode = c)} />
    {:else}
      <SequenceCanvas code={seqCode} oncodechange={(c) => (seqCode = c)} />
    {/if}
  </div>
</div>

<!-- Import dialog -->
{#if showImport}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) cancelImport();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') cancelImport();
    }}>
    <div
      class="flex w-full max-w-lg flex-col gap-4 rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-800"
      role="dialog"
      aria-modal="true"
      onkeydown={(e) => e.stopPropagation()}>
      <h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">
        Importar código Mermaid
      </h2>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        Acepta <code class="rounded bg-slate-100 px-1 dark:bg-slate-700">flowchart</code> y
        <code class="rounded bg-slate-100 px-1 dark:bg-slate-700">sequenceDiagram</code>. El modo
        cambia automáticamente.
      </p>

      <textarea
        class="h-52 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        placeholder="flowchart TD&#10;    A[Start] --> B[End]&#10;&#10;— o —&#10;&#10;sequenceDiagram&#10;    Alice->>Bob: Hola"
        bind:value={importText}></textarea>

      {#if importError}
        <p class="text-xs text-red-500">{importError}</p>
      {/if}

      <div class="flex justify-end gap-2">
        <button
          class="rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          onclick={cancelImport}>Cancelar</button>
        <button
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          onclick={confirmImport}>Importar</button>
      </div>
    </div>
  </div>
{/if}
