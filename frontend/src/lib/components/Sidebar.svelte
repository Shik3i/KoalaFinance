<script lang="ts">
  export let activeTab: string;
  export let onChangeTab: (tab: string) => void;
  export let currentUser: { username: string; role: string } | null;
  export let isKeysUnlocked: boolean;
  export let onLogout: () => void;
</script>

<aside class="sidebar">
  <div class="brand">
    <span class="logo">🐨</span>
    <span class="name">KoalaFinance</span>
  </div>

  {#if currentUser}
    <div class="user-status-card">
      <span class="user-name" title={currentUser.username}>{currentUser.username}</span>
      <span class="user-role">{currentUser.role}</span>
      <div class="lock-indicator">
        <span class="dot {isKeysUnlocked ? 'unlocked' : 'locked'}"></span>
        <span class="text">{isKeysUnlocked ? 'Keys Active' : 'Keys Cleared'}</span>
      </div>
    </div>
  {/if}

  <nav class="menu">
    <button
      class="menu-item {activeTab === 'vaults' ? 'active' : ''}"
      on:click={() => onChangeTab('vaults')}
    >
      <span class="icon">📦</span>
      <span class="label">Vaults Selection</span>
    </button>

    <button
      class="menu-item {activeTab === 'accounts' ? 'active' : ''}"
      on:click={() => onChangeTab('accounts')}
    >
      <span class="icon">🏦</span>
      <span class="label">Accounts</span>
    </button>

    <button
      class="menu-item {activeTab === 'transactions' ? 'active' : ''}"
      on:click={() => onChangeTab('transactions')}
    >
      <span class="icon">📝</span>
      <span class="label">Transactions</span>
    </button>

    <button
      class="menu-item {activeTab === 'categories' ? 'active' : ''}"
      on:click={() => onChangeTab('categories')}
    >
      <span class="icon">🗂️</span>
      <span class="label">Categories</span>
    </button>

    <button
      class="menu-item {activeTab === 'recurring' ? 'active' : ''}"
      on:click={() => onChangeTab('recurring')}
    >
      <span class="icon">🔄</span>
      <span class="label">Recurring Items</span>
    </button>

    <button
      class="menu-item {activeTab === 'subscriptions' ? 'active' : ''}"
      on:click={() => onChangeTab('subscriptions')}
    >
      <span class="icon">💳</span>
      <span class="label">Subscriptions</span>
    </button>

    {#if currentUser && currentUser.role === 'admin'}
      <button
        class="menu-item {activeTab === 'admin' ? 'active' : ''}"
        on:click={() => onChangeTab('admin')}
      >
        <span class="icon">🛡️</span>
        <span class="label">Admin Dashboard</span>
      </button>
    {/if}

    <button
      class="menu-item debug-item {activeTab === 'debug' ? 'active' : ''}"
      on:click={() => onChangeTab('debug')}
    >
      <span class="icon">🛠️</span>
      <span class="label">Developer Panel</span>
    </button>
  </nav>

  <div class="footer">
    <button class="logout-btn" on:click={onLogout}>
      <span class="icon">🚪</span>
      <span class="label">Logout</span>
    </button>
  </div>
</aside>

<style>
  .sidebar {
    background-color: #161b22;
    border-right: 1px solid #30363d;
    display: flex;
    flex-direction: column;
    width: 260px;
    height: 100vh;
    box-sizing: border-box;
    padding: 1.5rem 1rem;
    position: fixed;
    left: 0;
    top: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 1.5rem;
    padding-left: 0.5rem;
  }

  .logo {
    font-size: 1.8rem;
  }

  .name {
    color: #f0f6fc;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .user-status-card {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 0.8rem;
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .user-name {
    color: #c9d1d9;
    font-weight: 600;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-role {
    color: #8b949e;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .lock-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
    font-size: 0.75rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot.unlocked {
    background-color: #2ea043;
    box-shadow: 0 0 4px #2ea043;
  }

  .dot.locked {
    background-color: #f85149;
    box-shadow: 0 0 4px #f85149;
  }

  .lock-indicator .text {
    color: #8b949e;
  }

  .menu {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex-grow: 1;
  }

  .menu-item {
    background: none;
    border: none;
    border-radius: 6px;
    color: #8b949e;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.6rem 0.8rem;
    text-align: left;
    width: 100%;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .menu-item:hover {
    background-color: #21262d;
    color: #c9d1d9;
  }

  .menu-item.active {
    background-color: #21262d;
    color: #58a6ff;
    border: 1px solid #30363d;
  }

  .debug-item {
    margin-top: 1rem;
    border: 1px dashed #30363d;
  }

  .logout-btn {
    background: none;
    border: 1px solid #da3637;
    border-radius: 6px;
    color: #f85149;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.6rem 0.8rem;
    text-align: left;
    width: 100%;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .logout-btn:hover {
    background-color: #da3637;
    color: #ffffff;
  }
</style>
