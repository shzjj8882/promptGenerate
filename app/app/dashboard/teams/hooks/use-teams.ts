import { useState, useCallback, useRef } from "react";
import { getTeams, Team } from "@/lib/api/teams";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { useErrorHandler } from "@/hooks/use-error-handler";

export interface UseTeamsProps {
  initialTeams?: Team[];
  initialTotal?: number;
  initialPage?: number;
  onTotalChange: (total: number) => void;
}

/**
 * 管理团队列表数据获取和状态的 Hook
 */
export function useTeams({
  initialTeams,
  initialTotal,
  initialPage = 1,
  onTotalChange,
}: UseTeamsProps) {
  const [teams, setTeams] = useState<Team[]>(initialTeams ?? []);
  const [loading, setLoading] = useState(!initialTeams);
  const [error, setError] = useState<string>("");

  const loadingTeamsRef = useRef(false);
  const { handleError } = useErrorHandler({ setError, showToast: false });

  const fetchTeams = useCallback(
    async (page: number) => {
      if (loadingTeamsRef.current) return;
      try {
        loadingTeamsRef.current = true;
        setLoading(true);
        const skip = (page - 1) * DEFAULT_PAGE_SIZE;
        const response = await getTeams({ skip, limit: DEFAULT_PAGE_SIZE });
        setTeams(response.items);
        onTotalChange(response.total);
      } catch (err) {
        handleError(err, "加载团队列表失败");
      } finally {
        setLoading(false);
        loadingTeamsRef.current = false;
      }
    },
    [onTotalChange, handleError]
  );

  return {
    teams,
    setTeams,
    loading,
    error,
    setError,
    fetchTeams,
  };
}
