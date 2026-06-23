<script lang="ts">
  import { categories, loading, error, warning, refreshRecords, archiveRecord } from "../../finance/store";
  import type { CategoryRecord, CategoryKind, LoadedFinanceRecord } from "../../finance/types";
  import CategoryForm from "./CategoryForm.svelte";

  export let csrfToken = "";

  let showForm = false;
  let editingCategory: LoadedFinanceRecord<CategoryRecord> | undefined = undefined;
  let showArchived = false;

  $: activeCategories = $categories.filter((c) => !c.payload.archived);
  $: visibleCategories = showArchived ? $categories : activeCategories;

  // Group visible categories by kind
  $: categoriesByKind = visibleCategories.reduce((acc, cat) => {
    const kind = cat.payload.kind;
    if (!acc[kind]) {
      acc[kind] = [];
    }
    acc[kind].push(cat);
    return acc;
  }, {} as Record<CategoryKind, LoadedFinanceRecord<CategoryRecord>[]>);

  const kindLabels: Record<CategoryKind, string> = {
    expense: "💸 Expense Categories",
    income: "📈 Income Categories",
    transfer: "🔄 Transfer Categories",
    mixed: "🏷️ Mixed Categories"
  };

  const kindOrder: CategoryKind[] = ["expense", "income", "transfer", "mixed"];

  function handleEdit(cat: LoadedFinanceRecord<CategoryRecord>) {
    editingCategory = cat;
    showForm = true;
  }

  function handleAdd() {
    editingCategory = undefined;
    showForm = true;
  }

  async function handleArchive(cat: LoadedFinanceRecord<CategoryRecord>) {
    if (confirm(`Are you sure you want to archive category "${cat.payload.name}"?`)) {
      try {
        await archiveRecord("category", cat.payload, cat.recordId, csrfToken);
      } catch (err: any) {
        alert(err.message || "Failed to archive category");
      }
    }
  }

  async function handleUnarchive(cat: LoadedFinanceRecord<CategoryRecord>) {
    try {
      const updated = { ...cat.payload, archived: false, updatedAt: new Date().toISOString() };
      await archiveRecord("category", updated, cat.recordId, csrfToken);
    } catch (err: any) {
      alert(err.message || "Failed to unarchive category");
    }
  }
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h2>🗂️ Categories Management</h2>
      <p class="view-desc">Create and organize envelope budgeting categories with custom labels, colors, and emojis.</p>
    </div>
    <div class="header-actions">
      <button class="toggle-archived-btn" on:click={() => (showArchived = !showArchived)}>
        {showArchived ? "Hide Archived" : "Show Archived ({archivedCategories.length})"}
      </button>
      <button class="add-btn" on:click={handleAdd}>
        + Add Category
      </button>
    </div>
  </div>

  {#if $error}
    <div class="banner error-banner">
      <strong>Error:</strong> {$error}
      <button class="reload-btn" on:click={refreshRecords}>Reload</button>
    </div>
  {/if}

  {#if $warning}
    <div class="banner warning-banner">
      <strong>Warning:</strong> {$warning}
    </div>
  {/if}

  {#if $loading}
    <div class="loading-state">
      <span class="spinner"></span>
      <p>Loading decrypted categories...</p>
    </div>
  {:else if $categories.length === 0}
    <div class="empty-state">
      <span class="icon">🗂️</span>
      <h3>No categories found</h3>
      <p>Default categories should seed automatically during vault creation. Create your first category manually.</p>
      <button class="add-btn" on:click={handleAdd}>+ Add Category</button>
    </div>
  {:else}
    <div class="categories-layout">
      {#each kindOrder as kind}
        {#if categoriesByKind[kind] && categoriesByKind[kind].length > 0}
          <div class="kind-section">
            <h3 class="section-title">{kindLabels[kind]}</h3>
            <div class="category-grid">
              {#each categoriesByKind[kind] as cat}
                <div class="category-card {cat.payload.archived ? 'archived' : ''}" style="--cat-border-color: {cat.payload.color || '#30363d'}">
                  <div class="card-left">
                    <span class="category-icon">{cat.payload.icon || "🏷️"}</span>
                    <div class="category-details">
                      <span class="category-name">{cat.payload.name}</span>
                      {#if cat.payload.archived}
                        <span class="badge archived-badge">Archived</span>
                      {/if}
                    </div>
                  </div>
                  <div class="card-actions">
                    <button class="action-btn edit-btn" on:click={() => handleEdit(cat)}>Edit</button>
                    {#if cat.payload.archived}
                      <button class="action-btn unarchive-btn" on:click={() => handleUnarchive(cat)}>Unarchive</button>
                    {:else}
                      <button class="action-btn archive-btn" on:click={() => handleArchive(cat)}>Archive</button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if showForm}
    <CategoryForm
      editingCategory={editingCategory}
      {csrfToken}
      onClose={() => {
        showForm = false;
        editingCategory = undefined;
      }}
    />
  {/if}
</div>

<style>
  .view-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #30363d;
    padding-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .view-header h2 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.5rem;
  }

  .view-desc {
    margin: 0.3rem 0 0 0;
    color: #8b949e;
    font-size: 0.9rem;
  }

  .header-actions {
    display: flex;
    gap: 0.8rem;
    align-items: center;
  }

  .toggle-archived-btn {
    background: none;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .toggle-archived-btn:hover {
    border-color: #8b949e;
    color: #c9d1d9;
  }

  .add-btn {
    background-color: #238636;
    border: 1px solid #2ea043;
    border-radius: 6px;
    color: #ffffff;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .add-btn:hover {
    background-color: #2ea043;
  }

  .banner {
    border-radius: 6px;
    padding: 0.8rem 1rem;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .error-banner {
    background-color: rgba(248, 81, 73, 0.1);
    border: 1px solid #f85149;
    color: #ff7b72;
  }

  .warning-banner {
    background-color: rgba(210, 153, 34, 0.1);
    border: 1px solid #d29922;
    color: #d29922;
  }

  .reload-btn {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    border-radius: 4px;
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .reload-btn:hover {
    background-color: #30363d;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    gap: 1rem;
    color: #8b949e;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(88, 166, 255, 0.2);
    border-top-color: #58a6ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    background-color: #161b22;
    border: 1px dashed #30363d;
    border-radius: 12px;
    text-align: center;
    gap: 0.8rem;
  }

  .empty-state .icon {
    font-size: 3rem;
  }

  .empty-state h3 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.25rem;
  }

  .empty-state p {
    margin: 0 0 0.8rem 0;
    color: #8b949e;
    font-size: 0.95rem;
    max-width: 360px;
  }

  .categories-layout {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .kind-section {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .section-title {
    margin: 0;
    color: #c9d1d9;
    font-size: 1.1rem;
    font-weight: 600;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.4rem;
  }

  .category-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.8rem;
  }

  .category-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-left: 4px solid var(--cat-border-color);
    border-radius: 6px;
    padding: 0.8rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-sizing: border-box;
    transition: background-color 0.15s ease;
  }

  .category-card:hover {
    background-color: rgba(33, 38, 45, 0.3);
  }

  .category-card.archived {
    opacity: 0.6;
    border-left-color: #30363d !important;
  }

  .card-left {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .category-icon {
    font-size: 1.4rem;
  }

  .category-details {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .category-name {
    color: #c9d1d9;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .badge {
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 0.05rem 0.3rem;
    display: inline-block;
  }

  .archived-badge {
    background-color: #21262d;
    border: 1px solid #30363d;
    color: #8b949e;
  }

  .card-actions {
    display: flex;
    gap: 0.4rem;
  }

  .action-btn {
    background: none;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    font-weight: 500;
  }

  .action-btn:hover {
    color: #c9d1d9;
    border-color: #8b949e;
  }

  .edit-btn:hover {
    background-color: #21262d;
  }

  .archive-btn {
    border-color: rgba(248, 81, 73, 0.3);
    color: #ff7b72;
  }

  .archive-btn:hover {
    background-color: rgba(248, 81, 73, 0.15);
    border-color: #f85149;
  }

  .unarchive-btn {
    border-color: rgba(57, 211, 83, 0.3);
    color: #39d353;
  }

  .unarchive-btn:hover {
    background-color: rgba(57, 211, 83, 0.15);
    border-color: #39d353;
  }
</style>
