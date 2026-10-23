import type { CategoryId } from "../types";

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  color: string;
  tint: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "moradia", label: "Moradia", color: "#8b7cf6", tint: "rgba(139, 124, 246, 0.14)" },
  { id: "alimentacao", label: "Alimentação", color: "#e08a3c", tint: "rgba(224, 138, 60, 0.15)" },
  { id: "transporte", label: "Transporte", color: "#4f8edb", tint: "rgba(79, 142, 219, 0.14)" },
  { id: "saude", label: "Saúde", color: "#e2688e", tint: "rgba(226, 104, 142, 0.14)" },
  { id: "educacao", label: "Educação", color: "#3fa8b8", tint: "rgba(63, 168, 184, 0.14)" },
  { id: "lazer", label: "Lazer", color: "#c47ad6", tint: "rgba(196, 122, 214, 0.14)" },
  { id: "contas", label: "Contas", color: "#7d8b9c", tint: "rgba(125, 139, 156, 0.16)" },
  { id: "assinaturas", label: "Assinaturas", color: "#d3695f", tint: "rgba(211, 105, 95, 0.14)" },
  { id: "outros", label: "Outros", color: "#96968a", tint: "rgba(150, 150, 138, 0.15)" },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as Record<CategoryId, CategoryMeta>;

export function categoryMeta(id: string): CategoryMeta {
  return CATEGORY_MAP[id as CategoryId] ?? CATEGORY_MAP.outros;
}
