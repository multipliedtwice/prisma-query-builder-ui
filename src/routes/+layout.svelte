<script lang="ts">
  import './layout.css';
  import { onMount } from "svelte";

  const { children } = $props();

  onMount(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  });
</script>

{@render children()}
