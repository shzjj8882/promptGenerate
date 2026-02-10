import { useCallback, useRef, useState } from "react";
import { getScenes, Scene as ApiScene } from "@/lib/api/scenes";
import { useErrorHandler } from "@/hooks/use-error-handler";
import type { Scene, PromptScene } from "../prompts-client";

/**
 * 管理场景数据的 Hook
 */
export function useScenes() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [scenesError, setScenesError] = useState<string | null>(null);
  
  const loadingScenesRef = useRef(false);
  
  const { handleError: handleScenesError } = useErrorHandler({ 
    setError: (error: string) => setScenesError(error), 
    showToast: false 
  });

  const fetchScenes = useCallback(async () => {
    if (loadingScenesRef.current) return;
    try {
      loadingScenesRef.current = true;
      setLoadingScenes(true);
      setScenesError(null);
      const data = await getScenes();
      const list: Scene[] = (data as ApiScene[]).map((s) => ({
        id: s.id,
        code: s.code as PromptScene,
        name: s.name,
        is_predefined: s.is_predefined,
        team_code: s.team_code,
      }));
      setScenes(list);
    } catch (e) {
      handleScenesError(e, "加载场景列表失败，请稍后重试");
      setScenes([]);
    } finally {
      setLoadingScenes(false);
      loadingScenesRef.current = false;
    }
  }, [handleScenesError]);

  return {
    scenes,
    loadingScenes,
    scenesError,
    fetchScenes,
    setScenes,
  };
}
