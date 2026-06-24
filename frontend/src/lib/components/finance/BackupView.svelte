<script lang="ts">
  import {
    accounts,
    categories,
    recurringItems,
    transactions,
    budgets,
    refreshRecords,
    getActiveVaultId
  } from "../../finance/store";
  import { formatMinorAsEuro } from "../../finance/money";

  export let csrfToken = "";

  // active vault details
  $: activeVaultId = getActiveVaultId();
  $: rawTransactions = $transactions.map((t) => t.payload);

  // Download helper
  function downloadFile(content: string, filename: string, contentType: string) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke object URL to free memory resources
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }

  // --- 1. Encrypted Vault Backup Export ---
  let exportingBackup = false;
  let exportBackupError = "";

  async function exportEncryptedBackup() {
    if (!activeVaultId) return;
    exportingBackup = true;
    exportBackupError = "";

    try {
      const res = await fetch(`/api/vaults/${activeVaultId}/records`);
      if (!res.ok) {
        throw new Error(`Failed to fetch raw records: HTTP ${res.status}`);
      }
      const rawRecords = await res.json();

      const backupData = {
        format: "koalafinance.encrypted_vault_backup",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        appVersion: "0.5.0",
        vaultId: activeVaultId,
        records: rawRecords
      };

      const jsonContent = JSON.stringify(backupData, null, 2);
      const today = new Date().toISOString().substring(0, 10);
      downloadFile(
        jsonContent,
        `koalafinance-vault-backup-${today}.json`,
        "application/json;charset=utf-8;"
      );
    } catch (err: any) {
      exportBackupError = err.message || "Failed to generate backup";
    } finally {
      exportingBackup = false;
    }
  }

  // --- 2. Encrypted Vault Backup Import ---
  let importFileElement: HTMLInputElement;
  let parsedBackup: any = null;
  let importValidationStatus: "idle" | "valid" | "invalid" = "idle";
  let importValidationError = "";
  let importSummary = {
    exportedAt: "",
    vaultId: "",
    totalRecords: 0,
    typeCounts: {} as Record<string, number>
  };

  let importConfirmCheckbox = false;
  let importing = false;
  let importResult = {
    success: false,
    imported: 0,
    skipped: 0,
    errors: 0,
    log: [] as string[]
  };

  function handleFileSelected(event: any) {
    parsedBackup = null;
    importValidationStatus = "idle";
    importValidationError = "";
    importResult.success = false;

    const file = event.target.files[0];
    if (!file) return;

    // Size limit of 10MB
    if (file.size > 10 * 1024 * 1024) {
      importValidationStatus = "invalid";
      importValidationError = "Backup file exceeds the maximum size limit of 10MB.";
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const text = e.target.result;
        const data = JSON.parse(text);

        if (!data || typeof data !== "object") {
          throw new Error("Invalid file content - must be a JSON object");
        }
        if (data.format !== "koalafinance.encrypted_vault_backup") {
          throw new Error("Unknown backup format or not a KoalaFinance backup");
        }
        if (data.formatVersion !== 1) {
          throw new Error(`Unsupported backup format version: ${data.formatVersion}`);
        }
        if (!data.vaultId || typeof data.vaultId !== "string") {
          throw new Error("Backup file is missing vault configuration metadata");
        }
        if (data.vaultId !== activeVaultId) {
          throw new Error(
            `Backup belongs to a different vault (ID: ${data.vaultId.substring(0, 8)}...). Backups can only be restored to their original vault.`
          );
        }
        if (!Array.isArray(data.records)) {
          throw new Error("Backup records array is missing or invalid");
        }

        // Validate structure of record elements
        for (const rec of data.records) {
          if (!rec.id || !rec.record_type || !rec.encrypted_payload || !rec.nonce) {
            throw new Error("Backup contains records with invalid or missing metadata");
          }
        }

        // Type counts
        const typeCounts: Record<string, number> = {};
        data.records.forEach((rec: any) => {
          typeCounts[rec.record_type] = (typeCounts[rec.record_type] || 0) + 1;
        });

        importSummary = {
          exportedAt: data.exportedAt || "Unknown",
          vaultId: data.vaultId,
          totalRecords: data.records.length,
          typeCounts
        };

        parsedBackup = data;
        importValidationStatus = "valid";
      } catch (err: any) {
        importValidationStatus = "invalid";
        importValidationError = err.message || "Failed to parse backup file.";
      }
    };
    reader.readAsText(file);
  }

  async function executeRestore() {
    if (!parsedBackup || !activeVaultId) return;
    importing = true;
    importResult = {
      success: false,
      imported: 0,
      skipped: 0,
      errors: 0,
      log: []
    };

    try {
      // 1. Fetch current database record IDs to check for duplicates
      const res = await fetch(`/api/vaults/${activeVaultId}/records`);
      if (!res.ok) {
        throw new Error(`Failed to fetch current vault records for duplicate checks: HTTP ${res.status}`);
      }
      const currentRecords = await res.json();
      const currentIds = new Set<string>(currentRecords.map((r: any) => r.id));

      // 2. Loop and POST non-duplicates
      for (const rec of parsedBackup.records) {
        if (currentIds.has(rec.id)) {
          importResult.skipped++;
          continue;
        }

        try {
          const postRes = await fetch(`/api/vaults/${activeVaultId}/records`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfToken
            },
            body: JSON.stringify({
              id: rec.id,
              record_type: rec.record_type,
              schema_version: rec.schema_version,
              crypto_version: rec.crypto_version,
              encrypted_payload: rec.encrypted_payload,
              nonce: rec.nonce
            })
          });

          if (postRes.ok) {
            importResult.imported++;
          } else {
            importResult.errors++;
            const errData = await postRes.json().catch(() => ({}));
            importResult.log.push(`Failed to import record ${rec.id}: ${errData.error || `HTTP ${postRes.status}`}`);
          }
        } catch (postErr: any) {
          importResult.errors++;
          importResult.log.push(`Network error importing record ${rec.id}: ${postErr.message}`);
        }
      }

      importResult.success = true;
      await refreshRecords();

      // Reset selection state
      if (importFileElement) {
        importFileElement.value = "";
      }
      parsedBackup = null;
      importValidationStatus = "idle";
      importConfirmCheckbox = false;
    } catch (err: any) {
      importResult.errors++;
      importResult.log.push(`Restore aborted: ${err.message}`);
    } finally {
      importing = false;
    }
  }

  // --- 3. Plaintext Decrypted JSON Export ---
  let jsonConfirmCheckbox = false;

  function exportPlaintextJSON() {
    if (!jsonConfirmCheckbox) return;

    const exportData = {
      exportedAt: new Date().toISOString(),
      accounts: $accounts.map((a) => a.payload),
      categories: $categories.map((c) => c.payload),
      recurringItems: $recurringItems.map((r) => r.payload),
      transactions: $transactions.map((t) => t.payload),
      budgets: $budgets.map((b) => b.payload)
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const today = new Date().toISOString().substring(0, 10);
    downloadFile(
      jsonContent,
      `koalafinance-decrypted-export-${today}.json`,
      "application/json;charset=utf-8;"
    );

    // Reset confirmation
    jsonConfirmCheckbox = false;
  }

  // --- 4. CSV Transactions Export ---
  let csvConfirmCheckbox = false;

  function escapeCSVField(val: any): string {
    if (val === undefined || val === null) return "";
    const str = String(val);
    const escaped = str.replace(/"/g, '""');
    if (
      escaped.includes(",") ||
      escaped.includes('"') ||
      escaped.includes("\n") ||
      escaped.includes("\r")
    ) {
      return `"${escaped}"`;
    }
    return escaped;
  }

  function exportTransactionsCSV() {
    if (!csvConfirmCheckbox) return;

    const headers = [
      "Date",
      "Type",
      "Account",
      "Destination Account",
      "Payee",
      "Total Amount",
      "Currency",
      "Split Categories",
      "Split Amounts",
      "Notes"
    ];

    const rows = rawTransactions.map((tx) => {
      const acc = $accounts.find((a) => a.payload.id === tx.accountId);
      const accountName = acc ? acc.payload.name : (tx.accountId || "");

      const destAcc = $accounts.find((a) => a.payload.id === tx.destinationAccountId);
      const destAccountName = destAcc ? destAcc.payload.name : (tx.destinationAccountId || "");

      const totalAmount = formatMinorAsEuro(tx.totalAmountMinor);

      const splitCategories = tx.splits
        ? tx.splits
            .map((sp) => {
              const cat = $categories.find((c) => c.payload.id === sp.categoryId);
              return cat ? cat.payload.name : (sp.categoryId || "");
            })
            .join("; ")
        : "";

      const splitAmounts = tx.splits
        ? tx.splits
            .map((sp) => {
              return formatMinorAsEuro(sp.amountMinor);
            })
            .join("; ")
        : "";

      return [
        tx.date || "",
        tx.type || "",
        accountName,
        destAccountName,
        tx.payee || "",
        totalAmount,
        tx.currency || "",
        splitCategories,
        splitAmounts,
        tx.notes || ""
      ];
    });

    const csvContent = [
      headers.map(escapeCSVField).join(","),
      ...rows.map((row) => row.map(escapeCSVField).join(","))
    ].join("\r\n");

    const today = new Date().toISOString().substring(0, 10);
    downloadFile(
      csvContent,
      `koalafinance-transactions-${today}.csv`,
      "text/csv;charset=utf-8;"
    );

    // Reset confirmation
    csvConfirmCheckbox = false;
  }
</script>

<div class="view-container">
  <div class="view-header">
    <div>
      <h2>💾 Vault Backup & Data Portability</h2>
      <p class="view-desc">Export encrypted backups or download decrypted copies of your financial ledgers.</p>
    </div>
  </div>

  <div class="panels-grid">
    <!-- Left Column: Backups (Encrypted) -->
    <div class="column-wrapper">
      <!-- 1. Encrypted Backup Export -->
      <div class="panel-card">
        <h3>📦 Encrypted Backup Export</h3>
        <p class="section-desc">
          Downloads the raw database ciphertexts from your current vault. This file contains no plaintext name, amount, or date metadata and is safe to store in cloud backups.
        </p>
        {#if exportBackupError}
          <div class="banner error-banner">{exportBackupError}</div>
        {/if}
        <button class="action-btn primary-btn" on:click={exportEncryptedBackup} disabled={exportingBackup}>
          {#if exportingBackup}
            Generating Backup...
          {:else}
            Download Encrypted Backup (.json)
          {/if}
        </button>
      </div>

      <!-- 2. Encrypted Backup Import -->
      <div class="panel-card">
        <h3>📥 Encrypted Backup Import</h3>
        <p class="section-desc">
          Select a versioned backup JSON. You can only restore backups created from this same vault. Imports will skip duplicate database record IDs without overwriting existing data.
        </p>

        <div class="file-picker-wrapper">
          <input
            type="file"
            id="backup-file-input"
            accept=".json"
            bind:this={importFileElement}
            on:change={handleFileSelected}
            disabled={importing}
          />
        </div>

        {#if importValidationStatus === "invalid"}
          <div class="banner error-banner">
            <strong>Invalid Backup:</strong> {importValidationError}
          </div>
        {/if}

        {#if importValidationStatus === "valid" && parsedBackup}
          <div class="summary-box">
            <h4>Backup File Summary</h4>
            <div class="summary-details">
              <div class="detail-row">
                <span>Backup Created:</span>
                <strong>{new Date(importSummary.exportedAt).toLocaleString()}</strong>
              </div>
              <div class="detail-row">
                <span>Vault ID:</span>
                <code>{importSummary.vaultId.substring(0, 16)}...</code>
              </div>
              <div class="detail-row font-highlight">
                <span>Total Records:</span>
                <strong>{importSummary.totalRecords}</strong>
              </div>
            </div>

            <div class="type-counts-preview">
              <h5>Record Types breakdown:</h5>
              <div class="counts-badges">
                {#each Object.entries(importSummary.typeCounts) as [type, count]}
                  <span class="count-badge">
                    <code>{type}</code>: {count}
                  </span>
                {/each}
              </div>
            </div>

            <div class="import-confirm-gate">
              <label class="confirm-checkbox-label">
                <input type="checkbox" bind:checked={importConfirmCheckbox} disabled={importing} />
                <span>I confirm that I want to restore {importSummary.totalRecords} records into my active vault.</span>
              </label>
              <button
                class="action-btn success-btn"
                on:click={executeRestore}
                disabled={!importConfirmCheckbox || importing}
              >
                {#if importing}
                  Restoring Backup...
                {:else}
                  Confirm & Execute Restore
                {/if}
              </button>
            </div>
          </div>
        {/if}

        {#if importResult.success}
          <div class="banner success-banner">
            <strong>Import Complete!</strong>
            <div class="result-stats">
              <span>Imported: <strong>{importResult.imported}</strong></span>
              <span>Skipped (Duplicates): <strong>{importResult.skipped}</strong></span>
              <span>Errors: <strong class={importResult.errors > 0 ? "text-error" : ""}>{importResult.errors}</strong></span>
            </div>
            {#if importResult.log.length > 0}
              <details class="error-log-details">
                <summary>View Import Log Messages</summary>
                <div class="log-scroll">
                  {#each importResult.log as logMsg}
                    <div class="log-entry">{logMsg}</div>
                  {/each}
                </div>
              </details>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Right Column: Plaintext Exports -->
    <div class="column-wrapper">
      <!-- 3. Plaintext JSON Export -->
      <div class="panel-card alert-border warning">
        <h3>🔓 Plaintext Decrypted JSON Export</h3>
        <p class="section-desc">
          Decrypts and exports your entire vault data (accounts, transactions, budgets, recurring items) into a standard readable JSON format.
        </p>

        <div class="scary-warning-box">
          <strong>⚠️ EXTREMELY SENSITIVE DATA WARNING</strong>
          <p>
            The generated file will contain all your personal financial accounts, transactions, spending amounts, and notes in unencrypted plain text. Anyone who obtains access to this file can view all your private finance details. Store it strictly in a secure, encrypted folder.
          </p>
        </div>

        <div class="export-gate">
          <label class="confirm-checkbox-label">
            <input type="checkbox" bind:checked={jsonConfirmCheckbox} />
            <span>I understand that this file contains unencrypted sensitive financial data and I will store it securely.</span>
          </label>
          <button
            class="action-btn warning-btn"
            on:click={exportPlaintextJSON}
            disabled={!jsonConfirmCheckbox}
          >
            Export Decrypted JSON
          </button>
        </div>
      </div>

      <!-- 4. CSV Transactions Export -->
      <div class="panel-card alert-border warning">
        <h3>📄 CSV Transactions Export</h3>
        <p class="section-desc">
          Exports your decrypted transactions ledger to a spreadsheet-compatible CSV file. Account IDs and category IDs are fully resolved to their human-readable names.
        </p>

        <div class="scary-warning-box">
          <strong>⚠️ PLAIN TEXT CSV WARNING</strong>
          <p>
            The exported CSV file is not password protected. It contains all transaction amounts, payees, category details, and notes in plain text. Secure it properly after download.
          </p>
        </div>

        <div class="export-gate">
          <label class="confirm-checkbox-label">
            <input type="checkbox" bind:checked={csvConfirmCheckbox} />
            <span>I understand that this CSV file contains unencrypted personal financial transactions.</span>
          </label>
          <button
            class="action-btn warning-btn"
            on:click={exportTransactionsCSV}
            disabled={!csvConfirmCheckbox}
          >
            Export Decrypted CSV (.csv)
          </button>
        </div>
      </div>
    </div>
  </div>
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
    border-bottom: 1px solid #30363d;
    padding-bottom: 1rem;
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

  .panels-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 1.5rem;
  }

  .column-wrapper {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .panel-card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-sizing: border-box;
  }

  .panel-card.alert-border.warning {
    border-color: rgba(210, 153, 34, 0.35);
  }

  .panel-card h3 {
    margin: 0;
    color: #f0f6fc;
    font-size: 1.15rem;
  }

  .section-desc {
    margin: 0;
    color: #8b949e;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .file-picker-wrapper {
    background-color: #0d1117;
    border: 1px dashed #30363d;
    border-radius: 6px;
    padding: 1rem;
    text-align: center;
  }

  .file-picker-wrapper input[type="file"] {
    color: #c9d1d9;
    font-size: 0.85rem;
    width: 100%;
    outline: none;
  }

  /* Banners */
  .banner {
    padding: 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .error-banner {
    background-color: rgba(248, 81, 73, 0.1);
    border: 1px solid #f85149;
    color: #ff7b72;
  }

  .success-banner {
    background-color: rgba(46, 160, 67, 0.1);
    border: 1px solid #2ea043;
    color: #c9d1d9;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .result-stats {
    display: flex;
    gap: 1.5rem;
    font-size: 0.85rem;
    border-top: 1px solid rgba(46, 160, 67, 0.2);
    border-bottom: 1px solid rgba(46, 160, 67, 0.2);
    padding: 0.5rem 0;
    margin: 0.3rem 0;
  }

  .text-error {
    color: #ff7b72;
  }

  .error-log-details {
    margin-top: 0.5rem;
  }

  .error-log-details summary {
    cursor: pointer;
    font-weight: 600;
    color: #58a6ff;
    outline: none;
  }

  .log-scroll {
    max-height: 100px;
    overflow-y: auto;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 0.5rem;
    margin-top: 0.3rem;
    font-family: monospace;
    font-size: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .log-entry {
    color: #ff7b72;
    white-space: pre-wrap;
  }

  /* Summary Box */
  .summary-box {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .summary-box h4 {
    margin: 0;
    color: #f0f6fc;
    font-size: 0.95rem;
    border-bottom: 1px solid #21262d;
    padding-bottom: 0.4rem;
  }

  .summary-details {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.85rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    color: #8b949e;
  }

  .detail-row strong {
    color: #c9d1d9;
  }

  .detail-row.font-highlight strong {
    color: #58a6ff;
  }

  .type-counts-preview h5 {
    margin: 0.5rem 0 0.3rem 0;
    color: #8b949e;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .counts-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .count-badge {
    background-color: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-size: 0.75rem;
    color: #c9d1d9;
  }

  .import-confirm-gate {
    border-top: 1px solid #21262d;
    padding-top: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  /* Warnings box */
  .scary-warning-box {
    background-color: rgba(240, 178, 56, 0.05);
    border: 1px solid rgba(240, 178, 56, 0.25);
    border-radius: 6px;
    padding: 0.8rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .scary-warning-box strong {
    color: #d29922;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
  }

  .scary-warning-box p {
    margin: 0;
    color: #c9d1d9;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .export-gate {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .confirm-checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: #8b949e;
    line-height: 1.3;
  }

  .confirm-checkbox-label input[type="checkbox"] {
    margin-top: 0.15rem;
  }

  .confirm-checkbox-label:hover {
    color: #c9d1d9;
  }

  /* Buttons */
  .action-btn {
    border-radius: 6px;
    border: 1px solid transparent;
    padding: 0.55rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    transition: all 0.12s ease;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .primary-btn {
    background-color: #21262d;
    border-color: #30363d;
    color: #c9d1d9;
  }

  .primary-btn:hover:not(:disabled) {
    background-color: #30363d;
    border-color: #8b949e;
  }

  .success-btn {
    background-color: #238636;
    border-color: #2ea043;
    color: #ffffff;
  }

  .success-btn:hover:not(:disabled) {
    background-color: #2ea043;
  }

  .warning-btn {
    background-color: rgba(240, 178, 56, 0.1);
    border-color: rgba(240, 178, 56, 0.3);
    color: #d29922;
  }

  .warning-btn:hover:not(:disabled) {
    background-color: #d29922;
    color: #0d1117;
    border-color: #d29922;
  }
</style>
