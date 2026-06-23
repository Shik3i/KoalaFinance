<script lang="ts">
  import { parseEuroToMinor, formatMinorAsEuro } from "../../finance/money";

  export let value: number | undefined = undefined;
  export let signed = false;
  export let disabled = false;
  export let placeholder = "0.00";
  export let id = "";

  let inputString = "";
  let localError = "";

  // React to external value changes
  $: if (value !== undefined) {
    const currentParsed = parseEuroToMinor(inputString, { signed });
    if (!currentParsed.ok || currentParsed.value !== value) {
      inputString = formatMinorAsEuro(value);
      localError = "";
    }
  } else if (inputString !== "" && value === undefined) {
    // If value was reset externally to undefined, clear input
    const currentParsed = parseEuroToMinor(inputString, { signed });
    if (currentParsed.ok) {
      inputString = "";
      localError = "";
    }
  }

  function handleInput() {
    if (!inputString.trim()) {
      value = undefined;
      localError = "";
      return;
    }
    const parsed = parseEuroToMinor(inputString, { signed });
    if (parsed.ok) {
      value = parsed.value;
      localError = "";
    } else {
      value = undefined;
      localError = parsed.error;
    }
  }
</script>

<div class="money-input-container">
  <div class="input-wrapper">
    <input
      type="text"
      {id}
      bind:value={inputString}
      on:input={handleInput}
      {disabled}
      {placeholder}
      class={localError ? "error" : ""}
      autocomplete="off"
    />
    <span class="currency-symbol">€</span>
  </div>
  {#if localError}
    <span class="input-error-msg">{localError}</span>
  {/if}
</div>

<style>
  .money-input-container {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  input {
    width: 100%;
    padding: 0.6rem 2.2rem 0.6rem 0.8rem;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-size: 0.95rem;
    font-family: inherit;
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  input:focus {
    border-color: #58a6ff;
    box-shadow: 0 0 0 3px rgba(56, 139, 253, 0.3);
    outline: none;
  }

  input.error {
    border-color: #f85149;
  }

  input.error:focus {
    box-shadow: 0 0 0 3px rgba(248, 81, 73, 0.3);
  }

  .currency-symbol {
    position: absolute;
    right: 0.8rem;
    color: #8b949e;
    font-weight: 500;
    pointer-events: none;
  }

  .input-error-msg {
    color: #ff7b72;
    font-size: 0.75rem;
    font-weight: 500;
  }

  input:disabled {
    background-color: #161b22;
    color: #8b949e;
    cursor: not-allowed;
  }
</style>
