/**
 * 模型 Logo 工具
 * 使用本地静态 SVG（public/model-logos/），无需远程请求
 * 图标来源：@lobehub/icons-static-svg (MIT)
 */

/** 本地 logo 路径前缀（public 下文件） */
const LOCAL_LOGO_PREFIX = "/model-logos";

/** provider/model 到本地图标文件名的映射（小写） */
const PROVIDER_TO_ICON_ID: Record<string, string> = {
  // 国际
  openai: "openai",
  anthropic: "anthropic",
  claude: "anthropic",
  google: "google",
  gemini: "gemini",
  deepmind: "google",
  microsoft: "microsoft",
  azure: "microsoft",
  meta: "meta",
  llama: "meta",
  mistral: "mistral",
  cohere: "cohere",
  perplexity: "perplexity",
  aws: "aws",
  bedrock: "bedrock",
  amazon: "aws",
  groq: "groq",
  together: "together",
  xai: "xai",
  grok: "xai",

  // 国内
  deepseek: "deepseek",
  "深言": "deepseek",
  moonshot: "moonshot",
  "月之暗面": "moonshot",
  "kimi": "moonshot",
  zhipu: "zhipu",
  "智谱": "zhipu",
  "glm": "zhipu",
  alibaba: "alibaba",
  "阿里": "alibaba",
  "通义": "alibaba",
  qwen: "alibaba",
  minimax: "minimax",
  "海螺": "minimax",
  bytedance: "bytedance",
  "字节": "bytedance",
  "豆包": "bytedance",
  baidu: "baidu",
  "百度": "baidu",
  "文心": "baidu",
  wenxin: "baidu",
  tencent: "tencent",
  "腾讯": "tencent",
  "混元": "tencent",
  hunyuan: "tencent",
  baichuan: "baichuan",
  "百川": "baichuan",
  "零一": "lingyi",
  lingyi: "lingyi",
  "01.ai": "lingyi",
  "阶跃": "stepfun",
  stepfun: "stepfun",
  "硅基": "siliconflow",
  siliconflow: "siliconflow",
  "阶跃星辰": "stepfun",
  doubao: "bytedance",
  ollama: "ollama",
};

/**
 * 根据 provider 和 model 获取 logo URL
 * @param provider 提供商名称（如 openai、智谱）
 * @param model 模型标识（如 gpt-4o、glm-4），用于辅助匹配
 */
export function getModelLogoUrl(provider: string, model?: string): string | null {
  const normalized = provider?.trim().toLowerCase() || "";
  const modelLower = model?.trim().toLowerCase() || "";

  // 优先用 provider 精确匹配
  let iconId = PROVIDER_TO_ICON_ID[normalized] ?? PROVIDER_TO_ICON_ID[provider?.trim() ?? ""];

  // 若 provider 未匹配，尝试从 model 推断（如 gpt-4 -> openai, claude -> anthropic）
  if (!iconId && modelLower) {
    if (modelLower.includes("gpt") || modelLower.includes("o1") || modelLower.includes("davinci")) {
      iconId = "openai";
    } else if (modelLower.includes("claude")) {
      iconId = "anthropic";
    } else if (modelLower.includes("gemini") || modelLower.includes("palm")) {
      iconId = "google";
    } else if (modelLower.includes("deepseek") || modelLower.includes("deepseek")) {
      iconId = "deepseek";
    } else if (modelLower.includes("glm") || modelLower.includes("chatglm")) {
      iconId = "zhipu";
    } else if (modelLower.includes("qwen") || modelLower.includes("通义")) {
      iconId = "alibaba";
    } else if (modelLower.includes("kimi") || modelLower.includes("moonshot")) {
      iconId = "moonshot";
    } else if (modelLower.includes("wenxin") || modelLower.includes("ernie")) {
      iconId = "baidu";
    } else if (modelLower.includes("hunyuan") || modelLower.includes("混元")) {
      iconId = "tencent";
    } else if (modelLower.includes("doubao") || modelLower.includes("豆包")) {
      iconId = "bytedance";
    } else if (modelLower.includes("minimax") || modelLower.includes("abab")) {
      iconId = "minimax";
    } else if (modelLower.includes("llama")) {
      iconId = "meta";
    } else if (modelLower.includes("mistral")) {
      iconId = "mistral";
    }
  }

  if (!iconId) return null;
  return `${LOCAL_LOGO_PREFIX}/${iconId}.svg`;
}
