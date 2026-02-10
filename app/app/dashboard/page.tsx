"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";
import { Copy, Check, Key, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getMyTeam, resetMyTeamAuthcode } from "@/lib/api/teams";
import { Team } from "@/lib/api/teams";
import { userStore } from "@/store/user-store";
import { logger } from "@/lib/utils/logger";
import { getCurrentUser } from "@/lib/api/auth";

function DashboardPageImpl() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // 使用 ref 跟踪是否已经请求过，以及上一次的 team_code，避免重复请求
  const hasFetchedRef = useRef(false);
  const lastTeamCodeRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 使用 useMemo 提取 team_code 的字符串值，避免对象引用变化导致的重复渲染
  const teamCodeValue = useMemo(() => userStore.user?.team_code ?? null, [userStore.user?.team_code]);

  useEffect(() => {
    if (!mounted) return;

    const currentTeamCode = teamCodeValue;
    
    // 如果 team_code 没有变化且已经请求过，则不重复请求
    if (hasFetchedRef.current && lastTeamCodeRef.current === currentTeamCode) {
      return;
    }

    // 只有有团队的用户才需要获取团队信息
    if (!currentTeamCode) {
      setLoading(false);
      setTeam(null);
      hasFetchedRef.current = false;
      lastTeamCodeRef.current = undefined;
      return;
    }

    // 如果 team_code 发生了变化，才重新请求
    if (lastTeamCodeRef.current !== currentTeamCode) {
      // 标记为已请求，记录当前的 team_code
      hasFetchedRef.current = true;
      lastTeamCodeRef.current = currentTeamCode;

      const fetchTeam = async () => {
        try {
          const teamData = await getMyTeam();
          setTeam(teamData);
        } catch (err) {
          logger.error("获取团队信息失败", err);
          // 请求失败时重置标记，允许重试
          hasFetchedRef.current = false;
        } finally {
          setLoading(false);
        }
      };

      fetchTeam();
    }
  }, [mounted, teamCodeValue]); // 依赖 teamCodeValue（字符串值），而不是 userStore.user 对象

  // 使用 useMemo 稳定 team_authcode 的值（仅用于显示，不影响请求）
  const teamAuthcode = useMemo(() => userStore.user?.team_authcode, [userStore.user?.team_authcode]);
  
  // 使用 useMemo 稳定 team_code 的值（仅用于显示）
  const teamCode = useMemo(() => userStore.user?.team_code, [userStore.user?.team_code]);

  const handleCopyAuthcode = useCallback(async () => {
    const authcode = team?.authcode || teamAuthcode;
    if (!authcode) return;
    try {
      await navigator.clipboard.writeText(authcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error("复制失败", err);
    }
  }, [team?.authcode, teamAuthcode]);

  const handleResetAuthcode = useCallback(async () => {
    setResetting(true);
    try {
      const updatedTeam = await resetMyTeamAuthcode();
      setTeam(updatedTeam);
      
      // 刷新用户信息以获取新的 team_authcode
      const userInfo = await getCurrentUser();
      userStore.setUser(userInfo);
      
      setResetDialogOpen(false);
      logger.info("认证码重置成功");
    } catch (err) {
      logger.error("重置认证码失败", err);
    } finally {
      setResetting(false);
    }
  }, []);


  // 获取认证码（优先使用用户信息中的，其次使用团队信息中的）
  const authcode = mounted ? (teamAuthcode || team?.authcode) : null;
  const teamName = mounted ? (team?.name || (teamCode ? `团队: ${teamCode}` : "")) : "";

  return (
    <div className="space-y-6">
      {/* API 认证码卡片 - 所有用户都可以看到（如果有认证码） */}
      {mounted && (teamCode || authcode) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 px-6">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <CardTitle>API 认证码</CardTitle>
            </div>
            {teamName && (
              <Badge variant="outline" className="font-mono text-xs">
                {teamName}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : authcode ? (
              <div className="space-y-4">
                <CardDescription className="mt-0">
                  用于调用 <code className="text-xs bg-muted px-1 py-0.5 rounded">/api</code> 接口的认证码，请在请求头中添加 <code className="text-xs bg-muted px-1 py-0.5 rounded">X-Team-AuthCode</code>
                </CardDescription>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <code className="block w-full text-sm font-mono bg-muted px-3 py-2 pr-20 rounded border break-all">
                      {authcode}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyAuthcode}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {teamCode && (
                    <Button
                      size="sm"
                      onClick={() => setResetDialogOpen(true)}
                      className="shrink-0 bg-black text-white hover:bg-black/90"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      重置认证码
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                未找到团队认证码，请联系管理员生成
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 重置认证码确认对话框 */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置认证码</AlertDialogTitle>
            <AlertDialogDescription>
              确定要重置团队认证码吗？重置后，旧的认证码将立即失效，请确保已通知相关使用方更新认证码。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAuthcode}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? "重置中..." : "确认重置"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 功能卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>租户管理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              管理租户信息，包括租户名称、编号等
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>提示词管理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              编辑和管理提示词，支持占位符功能
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>多维表格</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              管理多维表格配置和数据
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const DashboardPage = observer(DashboardPageImpl);

export default DashboardPage;

