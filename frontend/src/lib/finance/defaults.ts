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
 * Generates a list of default CategoryRecord objects.
 * IDs are random UUIDs to ensure server-visible metadata remains generic.
 */
export function generateDefaultCategories(): CategoryRecord[] {
  const timestamp = new Date().toISOString();
  
  return DEFAULT_CATEGORIES.map((info) => {
    const id = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

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
