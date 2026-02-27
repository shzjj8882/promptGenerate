"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Pencil, Eye, EyeOff, Send, HelpCircle, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getNotificationConfigs,
  getNotificationConfig,
  updateNotificationConfig,
  testEmailNotification,
  testEmailWithConfig,
  type NotificationConfigListItem,
  type NotificationConfigDetail,
  type EmailProvider,
  type TestEmailContentType,
} from "@/lib/api/notification-config";
import { useErrorHandler } from "@/hooks/use-error-handler";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { showSuccessToast } from "@/lib/utils/toast";

export function NotificationConfigClient() {
  const [configs, setConfigs] = useState<NotificationConfigListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<NotificationConfigDetail | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState<{
    provider?: EmailProvider;
    api_user?: string;
    api_key?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    use_tls?: boolean;
    from_email?: string;
    from_name?: string;
  }>({ provider: "sendcloud" });
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 测试发送弹窗
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testing, setTesting] = useState(false);
  // 测试来源：card=使用已保存配置，edit=使用当前表单数据
  const [testSource, setTestSource] = useState<"card" | "edit">("card");
  const [testConfigId, setTestConfigId] = useState<string | null>(null);
  // 测试时选择的内容格式（仅测试时）
  const [testContentType, setTestContentType] = useState<TestEmailContentType>("html");

  const { handleError } = useErrorHandler({ showToast: true });

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const items = await getNotificationConfigs();
      setConfigs(items);
    } catch (error) {
      handleError(error, "加载通知配置失败");
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleOpenEdit = async (item: NotificationConfigListItem) => {
    try {
      const detail = await getNotificationConfig(item.id, true);
      setSelectedConfig(detail);
      const cfg = (detail.config || {}) as Record<string, unknown>;
      const provider = ((cfg.provider ?? cfg.email_provider ?? "sendcloud") as string).toLowerCase();
      const isSmtp = provider === "smtp" || !!(cfg.host ?? cfg.smtp_host);
      setFormData({
        provider: isSmtp ? "smtp" : "sendcloud",
        api_user: (cfg.api_user as string) ?? "",
        api_key: (cfg.api_key as string) ?? "",
        host: (cfg.host ?? cfg.smtp_host ?? "") as string,
        port: Number(cfg.port ?? cfg.smtp_port ?? 587) || 587,
        username: (cfg.username ?? cfg.user ?? "") as string,
        password: (cfg.password ?? cfg.pass ?? "") as string,
        use_tls: cfg.use_tls !== false,
        from_email: (cfg.from_email ?? cfg.from ?? "") as string,
        from_name: (cfg.from_name ?? cfg.fromName ?? "") as string,
      });
      setShowApiKey(false);
      setShowPassword(false);
      setIsEditDialogOpen(true);
    } catch (error) {
      handleError(error, "加载配置详情失败");
    }
  };

  const handleSave = async () => {
    if (!selectedConfig) return;
    try {
      setSaving(true);
      const provider = formData.provider ?? "sendcloud";
      const config: Record<string, unknown> = {
        provider,
        from_email: formData.from_email?.trim() || undefined,
        from_name: formData.from_name?.trim() || undefined,
      };
      if (provider === "smtp") {
        config.host = formData.host?.trim() || undefined;
        config.port = formData.port ?? 587;
        config.username = formData.username?.trim() || undefined;
        const pw = formData.password?.trim();
        if (pw && !pw.startsWith("****")) config.password = pw;
        config.use_tls = formData.use_tls ?? true;
      } else {
        config.api_user = formData.api_user?.trim() || undefined;
        const apiKey = formData.api_key?.trim();
        if (apiKey && !apiKey.startsWith("****")) config.api_key = apiKey;
      }
      await updateNotificationConfig(selectedConfig.id, { config });
      showSuccessToast("保存成功");
      setIsEditDialogOpen(false);
      setSelectedConfig(null);
      fetchConfigs();
    } catch (error) {
      handleError(error, "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const openTestDialog = (source: "card" | "edit", configId?: string) => {
    setTestSource(source);
    setTestConfigId(configId ?? null);
    setTestEmailTo("");
    setTestContentType("html");
    setIsTestDialogOpen(true);
  };

  const handleSendTest = async () => {
    const to = testEmailTo?.trim();
    if (!to) {
      handleError(new Error("请输入收件人邮箱"), "测试发送");
      return;
    }
    try {
      setTesting(true);
      if (testSource === "card" && testConfigId) {
        await testEmailNotification(testConfigId, to, testContentType);
      } else if (testSource === "edit") {
        const provider = formData.provider ?? "sendcloud";
        if (provider === "smtp") {
          if (!formData.host?.trim() || !formData.from_email?.trim()) {
            handleError(new Error("请填写 SMTP 服务器地址和发件人邮箱"), "测试发送");
            return;
          }
          const pw = formData.password?.trim();
          if (!pw || pw.startsWith("****")) {
            handleError(new Error("请填写完整的 SMTP 密码（未保存时需重新输入）"), "测试发送");
            return;
          }
          await testEmailWithConfig({
            provider: "smtp",
            host: formData.host!.trim(),
            port: formData.port ?? 587,
            username: formData.username?.trim() ?? "",
            password: pw,
            use_tls: formData.use_tls ?? true,
            from_email: formData.from_email!.trim(),
            from_name: formData.from_name?.trim() ?? "",
            email_to: to,
            content_type: testContentType,
          });
        } else {
          const apiKey = formData.api_key?.trim();
          if (!apiKey || apiKey.startsWith("****")) {
            handleError(new Error("请填写完整的 API Key（未保存时需重新输入）"), "测试发送");
            return;
          }
          if (!formData.api_user?.trim() || !formData.from_email?.trim()) {
            handleError(new Error("请填写 API User 和发件人邮箱"), "测试发送");
            return;
          }
          await testEmailWithConfig({
            provider: "sendcloud",
            api_user: formData.api_user!.trim(),
            api_key: apiKey,
            from_email: formData.from_email!.trim(),
            from_name: formData.from_name?.trim() ?? "",
            email_to: to,
            content_type: testContentType,
          });
        }
      }
      showSuccessToast("测试邮件已发送，请查收");
      setIsTestDialogOpen(false);
    } catch (error) {
      handleError(error, "测试发送失败");
    } finally {
      setTesting(false);
    }
  };

  const emailConfig = configs.find((c) => c.type === "email");

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="hidden sm:block">
        <PageHeader
          title="通知中心"
          description="配置通知方式（邮件 SendCloud / SMTP 等），用于提示词接口模式的异步通知"
        />
      </div>

      {loading ? (
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-3 w-48 bg-muted rounded" />
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card
            className={`min-w-0 w-full max-w-full cursor-pointer py-0 transition-all active:scale-[0.99] sm:cursor-default sm:active:scale-100 ${
              emailConfig?.is_configured ? "border-solid" : "border-2 border-dashed border-muted-foreground/30"
            }`}
            onClick={() => {
              if (emailConfig && typeof window !== "undefined" && window.innerWidth < 640) {
                handleOpenEdit(emailConfig);
              }
            }}
          >
            {/* 移动端：列表式布局 */}
            <div className="flex items-center gap-4 p-4 sm:hidden">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  emailConfig?.is_configured ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted/80 text-muted-foreground"
                }`}
              >
                <Mail className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">邮件通知</p>
                <p className="text-sm text-muted-foreground">
                  {emailConfig?.is_configured ? "已配置" : "点击配置"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" />
            </div>

            {/* PC 端：原有布局 */}
            <div className="hidden sm:block">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 py-5">
                <CardTitle className="text-sm font-medium flex items-center gap-2 shrink-0">
                  <Mail className="h-4 w-4 shrink-0" />
                  邮件通知
                </CardTitle>
                <div className="flex flex-nowrap gap-2">
                  {emailConfig?.is_configured && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTestDialog("card", emailConfig.id);
                      }}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      测试发送
                    </Button>
                  )}
                  <Button
                    variant={emailConfig?.is_configured ? "default" : "outline"}
                    size="sm"
                    className={emailConfig?.is_configured ? "bg-black text-white hover:bg-black/90" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      emailConfig && handleOpenEdit(emailConfig);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    {emailConfig?.is_configured ? "编辑" : "添加配置"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-5">
                {emailConfig?.is_configured ? (
                  <p className="text-sm text-muted-foreground">已配置，可编辑或发送测试邮件</p>
                ) : (
                  <p className="text-sm text-muted-foreground">点击「添加配置」选择邮件服务类型并填写参数</p>
                )}
              </CardContent>
            </div>
          </Card>
        </>
      )}

      {/* 编辑弹窗：PC 居中 Dialog，移动端底部 Sheet */}
      <ResponsiveDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title="编辑邮件通知"
        description="选择邮件服务类型（SendCloud / SMTP），配置参数用于异步任务完成后发送邮件"
        footer={
          <div className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
            <div className="hidden items-center gap-1 sm:flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openTestDialog("edit")}
              >
                <Send className="h-4 w-4 mr-2" />
                测试发送
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help inline-flex">
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    使用当前表单数据发送，无需先保存
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-1 justify-end gap-2 sm:flex-initial">
              <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(false)} disabled={saving}>
                取消
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4 py-2 sm:py-4">
          <div className="grid gap-2">
            <Label>邮件服务类型</Label>
            <Select
              value={formData.provider ?? "sendcloud"}
              onValueChange={(v) => setFormData((p) => ({ ...p, provider: v as EmailProvider }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sendcloud">SendCloud（API）</SelectItem>
                <SelectItem value="smtp">SMTP（标准协议）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(formData.provider ?? "sendcloud") === "sendcloud" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="api_user">API User</Label>
                <Input
                  id="api_user"
                  value={formData.api_user ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, api_user: e.target.value }))}
                  placeholder="SendCloud API 用户"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api_key">API Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="api_key"
                    type={showApiKey ? "text" : "password"}
                    value={formData.api_key ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, api_key: e.target.value }))}
                    placeholder="SendCloud API 密钥"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? "隐藏" : "显示"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="smtp_host">SMTP 服务器</Label>
                <Input
                  id="smtp_host"
                  value={formData.host ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, host: e.target.value }))}
                  placeholder="例如 smtp.qq.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp_port">端口</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  value={formData.port ?? 587}
                  onChange={(e) => setFormData((p) => ({ ...p, port: parseInt(e.target.value, 10) || 587 }))}
                  placeholder="587"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp_username">用户名</Label>
                <Input
                  id="smtp_username"
                  value={formData.username ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value }))}
                  placeholder="SMTP 登录用户名"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp_password">密码</Label>
                <div className="flex gap-2">
                  <Input
                    id="smtp_password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password ?? ""}
                    onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                    placeholder="SMTP 登录密码或授权码"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "隐藏" : "显示"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="use_tls"
                  checked={formData.use_tls ?? true}
                  onCheckedChange={(v) => setFormData((p) => ({ ...p, use_tls: v === true }))}
                />
                <Label htmlFor="use_tls" className="cursor-pointer font-normal">使用 TLS</Label>
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="from_email">发件人邮箱</Label>
            <Input
              id="from_email"
              type="email"
              value={formData.from_email ?? ""}
              onChange={(e) => setFormData((p) => ({ ...p, from_email: e.target.value }))}
              placeholder="发件人邮箱"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="from_name">发件人名称</Label>
            <Input
              id="from_name"
              value={formData.from_name ?? ""}
              onChange={(e) => setFormData((p) => ({ ...p, from_name: e.target.value }))}
              placeholder="发件人显示名称"
            />
          </div>
        </div>
      </ResponsiveDialog>

      {/* 测试发送弹窗 */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] flex-col gap-4 overflow-hidden rounded-lg border bg-background p-4 shadow-lg sm:max-w-[400px] sm:w-full sm:p-6">
          <DialogHeader className="flex-shrink-0 space-y-1.5 text-left">
            <DialogTitle>测试发送邮件</DialogTitle>
            <DialogDescription>
              {testSource === "card"
                ? "使用已保存的配置发送测试邮件"
                : "使用当前表单的配置发送测试邮件（无需先保存）"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:py-4">
            <div className="grid gap-2">
              <Label htmlFor="test_email_to">收件人邮箱</Label>
              <Input
                id="test_email_to"
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="收件人邮箱"
              />
            </div>
            <div className="grid gap-2">
              <Label>测试内容格式</Label>
              <Select value={testContentType} onValueChange={(v) => setTestContentType(v as TestEmailContentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="html">邮件（HTML）</SelectItem>
                  <SelectItem value="plain">邮件（纯文本）</SelectItem>
                  <SelectItem value="file">邮件（文件附件）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">仅测试时可选，用于验证不同格式的发送效果</p>
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 flex-row justify-end gap-2 border-t pt-4 sm:border-0 sm:pt-0">
            <Button variant="outline" size="sm" onClick={() => setIsTestDialogOpen(false)} disabled={testing}>
              取消
            </Button>
            <Button size="sm" onClick={handleSendTest} disabled={testing}>
              {testing ? "发送中..." : "发送"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
