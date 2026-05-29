<script lang="ts">
  import { ModeWatcher } from 'mode-watcher';
  import { type Snippet } from 'svelte';
  import '../app.css';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<ModeWatcher />

<main class="h-dvh">
  {@render children()}
</main>
