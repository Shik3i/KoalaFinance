<script lang="ts">
  import { onMount } from 'svelte';

  export let csrfToken: string;

  let registrationEnabled = false;
  let userCount = 0;
  let vaultCount = 0;
  let recordCount = 0;
  let appVersion = '0.1.0';
  let isLoading = true;
  let errorMessage = '';
  let toggleMessage = '';

  onMount(async () => {
    await loadSettingsAndStats();
  });

  async function loadSettingsAndStats() {
    isLoading = true;
    errorMessage = '';
    try {
      // 1. Fetch settings
      const settingsRes = await fetch('/api/admin/settings');
      if (!settingsRes.ok) {
        throw new Error('Failed to load admin settings');
      }
      const settingsData = await settingsRes.json();
      registrationEnabled = settingsData.registration_enabled;

      // 2. Fetch stats
      const statsRes = await fetch('/api/admin/stats');
      if (!statsRes.ok) {
        throw new Error('Failed to load admin stats');
      }
      const statsData = await statsRes.json();
      userCount = statsData.user_count;
      vaultCount = statsData.vault_count;
      recordCount = statsData.record_count;
      appVersion = statsData.app_version || '0.1.0';
    } catch (err: any) {
      errorMessage = err.message;
    } finally {
      isLoading = false;
    }
  }

  async function handleToggleRegistration() {
    toggleMessage = '';
    try {
      const res = await fetch('/api/admin/settings/registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ enabled: registrationEnabled })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update registration setting');
      }

      toggleMessage = `Registration successfully ${registrationEnabled ? 'enabled' : 'disabled'}.`;
    } catch (err: any) {
      toggleMessage = `Error: ${err.message}`;
      // Revert local state
      registrationEnabled = !registrationEnabled;
    }
  }
</script>

<div class="admin-panel">
  <h2>🛡️ Site Administration</h2>
  <p class="desc">Manage global settings and monitor platform health. Financial records remain private and unreadable.</p>

  {#if isLoading}
    <p class="loading">Loading admin dashboard...</p>
  {:else if errorMessage}
    <p class="error-msg">{errorMessage}</p>
    <button class="retry-btn" on:click={loadSettingsAndStats}>Retry</button>
  {:else}
    <div class="admin-grid">
      <!-- Settings Panel -->
      <div class="admin-card">
        <h3>Platform Settings</h3>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-title">Enable Public Registration</span>
            <span class="setting-desc">When disabled, new signups via /register are blocked. Existing users can still authenticate.</span>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              bind:checked={registrationEnabled}
              on:change={handleToggleRegistration}
            />
            <span class="slider round"></span>
          </label>
        </div>
        {#if toggleMessage}
          <p class="status-msg">{toggleMessage}</p>
        {/if}
      </div>

      <!-- Stats Panel -->
      <div class="admin-card">
        <h3>Anonymous Platform Statistics</h3>
        <div class="stats-list">
          <div class="stat-item">
            <span class="stat-label">Total Users</span>
            <span class="stat-value">{userCount}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Encrypted Vaults</span>
            <span class="stat-value">{vaultCount}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Encrypted Records</span>
            <span class="stat-value">{recordCount}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">App Version</span>
            <span class="stat-value">{appVersion}</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .admin-panel {
    width: 100%;
  }

  h2 {
    color: #f0f6fc;
    font-size: 1.6rem;
    margin-top: 0;
    margin-bottom: 0.5rem;
  }

  .desc {
    color: #8b949e;
    font-size: 0.95rem;
    margin-bottom: 2rem;
  }

  .loading {
    color: #8b949e;
  }

  .error-msg {
    color: #f85149;
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .retry-btn {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .admin-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
  }

  h3 {
    color: #f0f6fc;
    font-size: 1.15rem;
    margin-top: 0;
    margin-bottom: 1.2rem;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.5rem;
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .setting-title {
    color: #f0f6fc;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .setting-desc {
    color: #8b949e;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .status-msg {
    color: #58a6ff;
    font-size: 0.85rem;
    margin-top: 1rem;
    margin-bottom: 0;
  }

  .stats-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }

  .stat-item {
    background-color: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .stat-label {
    color: #8b949e;
    font-size: 0.8rem;
    font-weight: 500;
    text-align: center;
  }

  .stat-value {
    color: #58a6ff;
    font-size: 1.8rem;
    font-weight: 700;
  }

  /* Switch Toggle Styles */
  .switch {
    position: relative;
    display: inline-block;
    width: 50px;
    height: 26px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #21262d;
    border: 1px solid #30363d;
    transition: .4s;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: #8b949e;
    transition: .4s;
  }

  input:checked + .slider {
    background-color: #238636;
    border-color: rgba(240, 246, 252, 0.1);
  }

  input:checked + .slider:before {
    transform: translateX(24px);
    background-color: #ffffff;
  }

  .slider.round {
    border-radius: 34px;
  }

  .slider.round:before {
    border-radius: 50%;
  }
</style>
