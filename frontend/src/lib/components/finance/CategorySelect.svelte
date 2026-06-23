<script lang="ts">
  import { categories } from "../../finance/store";

  export let value = "";
  export let required = false;
  export let id = "";
  export let disabled = false;

  $: activeCategories = $categories.filter((c) => !c.payload.archived);
</script>

<div class="select-wrapper">
  <select bind:value {required} {id} {disabled}>
    <option value="" disabled selected>Select category...</option>
    {#each activeCategories as cat}
      <option value={cat.payload.id}>
        {cat.payload.icon || "🏷️"} {cat.payload.name} ({cat.payload.kind})
      </option>
    {/each}
  </select>
</div>

<style>
  .select-wrapper {
    position: relative;
    width: 100%;
  }

  select {
    width: 100%;
    padding: 0.6rem 0.8rem;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 0.95rem;
    font-family: inherit;
    box-sizing: border-box;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  select:focus {
    border-color: #58a6ff;
    box-shadow: 0 0 0 3px rgba(56, 139, 253, 0.3);
    outline: none;
  }

  select:disabled {
    background-color: #161b22;
    color: #8b949e;
    cursor: not-allowed;
  }
</style>
