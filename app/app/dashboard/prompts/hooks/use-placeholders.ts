import { useCallback, useRef, useState } from "react";
import { getPlaceholders, type Placeholder as ApiPlaceholder } from "@/lib/api/prompts";
import type { Placeholder, PromptScene } from "../prompts-client";

/**
 * 管理占位符数据的 Hook
 */
export function usePlaceholders() {
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);
  
  const loadingPlaceholdersRef = useRef(false);

  const fetchPlaceholdersByScene = useCallback(async (scene: PromptScene) => {
    if (loadingPlaceholdersRef.current) return;
    try {
      loadingPlaceholdersRef.current = true;
      setLoadingPlaceholders(true);
      const response = await getPlaceholders({ scene });
      // getPlaceholders 返回的是 PaginatedPlaceholdersResponse，需要提取 items
      const placeholdersArray = response.items || (Array.isArray(response) ? response : []);
      const list: Placeholder[] = placeholdersArray.map((p: ApiPlaceholder) => ({
        key: p.key,
        label: p.label,
        scene: (p.scene ?? "") as PromptScene,
        description: p.description,
        data_source_type: p.data_source_type,
        data_type: p.data_type,
        table_id: p.table_id,
        table_column_key: p.table_column_key,
        table_row_id_param_key: p.table_row_id_param_key,
      }));
      setPlaceholders(list);
    } catch (error) {
      console.error("获取占位符失败", error);
      setPlaceholders([]);
    } finally {
      setLoadingPlaceholders(false);
      loadingPlaceholdersRef.current = false;
    }
  }, []);

  return {
    placeholders,
    loadingPlaceholders,
    fetchPlaceholdersByScene,
    setPlaceholders,
  };
}
