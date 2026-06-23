import type { CategoryRecord, CategoryKind } from "./types";

interface DefaultCategoryInfo {
  name: string;
  kind: CategoryKind;
  color?: string;
  icon?: string;
}

const DEFAULT_CATEGORIES: DefaultCategoryInfo[] = [
  // Income
  { name: "Salary", kind: "income", color: "#2ea043", icon: "💼" },
  { name: "Freelance / Side Income", kind: "income", color: "#238636", icon: "💻" },
  { name: "Other Income", kind: "income", color: "#56d364", icon: "💰" },
  
  // Expense
  { name: "Housing", kind: "expense", color: "#da3637", icon: "🏠" },
  { name: "Utilities", kind: "expense", color: "#f85149", icon: "⚡" },
  { name: "Groceries", kind: "expense", color: "#db6d28", icon: "🛒" },
  { name: "Transport", kind: "expense", color: "#d29922", icon: "🚗" },
  { name: "Insurance", kind: "expense", color: "#8957e5", icon: "🛡️" },
  { name: "Health", kind: "expense", color: "#ff7b72", icon: "🏥" },
  { name: "Entertainment", kind: "expense", color: "#bc8cff", icon: "🍿" },
  { name: "Software & Tools", kind: "expense", color: "#58a6ff", icon: "🛠️" },
  { name: "Hosting & Domains", kind: "expense", color: "#1f6feb", icon: "🌐" },
  { name: "Savings", kind: "expense", color: "#38bdf8", icon: "🐖" },
  { name: "Debt", kind: "expense", color: "#f43f5e", icon: "💳" },
  { name: "Other", kind: "expense", color: "#8b949e", icon: "🏷️" },

  // Transfer
  { name: "Transfer", kind: "transfer", color: "#6e7681", icon: "🔄" }
];

/**
 * Generates a list of default CategoryRecord objects for a given vault.
 * To avoid duplicate seeding on retries, IDs are deterministic per vault.
 */
export function generateDefaultCategories(vaultId: string): CategoryRecord[] {
  const timestamp = new Date().toISOString();
  
  return DEFAULT_CATEGORIES.map((info) => {
    // Generate stable, unique ID based on vaultId and category contents
    // This allows safe retries without duplication on conflicts
    const normalizedName = info.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const id = `cat_${vaultId.substring(0, 8)}_${info.kind}_${normalizedName}`;

    return {
      schemaVersion: 1,
      id,
      name: info.name,
      kind: info.kind,
      color: info.color,
      icon: info.icon,
      archived: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });
}
