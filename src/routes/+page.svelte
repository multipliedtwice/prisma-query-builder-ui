<script lang="ts">
  import QueryBuilder from "../components/QueryBuilder.svelte";

  let { data } = $props();
</script>

<QueryBuilder embeddedConfig={data.embeddedConfig} />