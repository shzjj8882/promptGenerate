"use client";
/**
 * 统一图标库 - 基于 IconPark 官方图标
 * 所有前端图标由此统一导出，保持风格一致
 * @see https://iconpark.oceanengine.com/official
 */
import {
  Add,
  Edit,
  Delete,
  Right,
  Down,
  Left,
  Up,
  Close,
  Save as SaveSvg,
  Undo,
  Redo,
  ArrowLeft as ArrowLeftSvg,
  ArrowDown as ArrowDownSvg,
  ArrowUp as ArrowUpSvg,
  Setting,
  Search as SearchSvg,
  More,
  Filter as FilterSvg,
  Upload as UploadSvg,
  Copy as CopySvg,
  Check as CheckSvg,
  Help,
  Send as SendSvg,
  Play as PlaySvg,
  Globe as GlobeSvg,
  Message as MessageSvg,
  Robot,
  BuildingTwo,
  Shield as ShieldIcon,
  People as PeopleSvg,
  FileText as FileTextSvg,
  Table as TableSvg,
  TableFile as TableFileSvg,
  Cpu as CpuSvg,
  Plug as PlugSvg,
  Mail as MailSvg,
  MenuUnfold,
  Components,
  Layers as LayersSvg,
  LayoutFour,
  Key as KeySvg,
  Drag,
  ChartHistogram,
  ChartPie,
  ChartLine,
  Minus,
  Sort,
  SortAmountDown,
  SortAmountUp,
  Eyes,
  FileHiding,
  Rocket as RocketSvg,
  Lightning,
  Lock as LockSvg,
  DatabaseConfig,
  Loading,
  Calendar,
  Tips,
  Refresh,
  FileCode as FileCodeSvg,
  Paperclip as PaperclipSvg,
  Bug as BugSvg,
  Earth,
  Sun as SunIcon,
  Moon as MoonIcon,
  Computer,
  Dot,
  Logout,
  IndentLeft,
  Magic,
  BookOpen,
  TrendingUp as TrendingUpSvg,
  HeadphoneSound,
  Info,
  Octagon,
  Forbid,
  TextStyleOne as TextStyleOneSvg,
  History as HistorySvg,
  FreezeColumn as FreezeColumnSvg,
  Communication as CommunicationSvg,
  Api as ApiSvg,
  Agreement as AgreementSvg,
} from "@icon-park/react";

import type { IIconProps } from "@icon-park/react/es/runtime";

/** IconPark 图标基础 props，与 lucide 的 className 兼容 */
export type IconComponentProps = IIconProps & {
  className?: string;
};

/** Tailwind 尺寸类到像素的映射（与 Tailwind 默认 1unit=4px 一致） */
const SIZE_CLASS_TO_PX: Record<string, number> = {
  "h-3": 12,
  "w-3": 12,
  "size-3": 12,
  "h-4": 16,
  "w-4": 16,
  "size-4": 16,
  "h-5": 20,
  "w-5": 20,
  "size-5": 20,
  "h-6": 24,
  "w-6": 24,
  "size-6": 24,
  "h-7": 28,
  "w-7": 28,
  "size-7": 28,
  "h-8": 32,
  "w-8": 32,
  "size-8": 32,
  "h-9": 36,
  "w-9": 36,
  "size-9": 36,
  "h-10": 40,
  "w-10": 40,
  "size-10": 40,
  "h-12": 48,
  "w-12": 48,
  "size-12": 48,
};

/** 从 className 解析尺寸，使 IconPark SVG 与 Tailwind 尺寸一致 */
function parseSizeFromClassName(className?: string): number | string | undefined {
  if (!className) return undefined;
  const tokens = className.split(/\s+/);
  for (const t of tokens) {
    const px = SIZE_CLASS_TO_PX[t];
    if (px) return px;
  }
  return undefined;
}

/** 包装 IconPark 图标以支持 className 和 size，保持与 lucide 用法一致 */
function wrapIcon(Icon: React.ComponentType<IIconProps>) {
  return function IconWrapped({ className, size, ...rest }: IconComponentProps) {
    const resolvedSize = size ?? parseSizeFromClassName(className) ?? 16;
    return <Icon {...rest} size={resolvedSize} className={className} />;
  };
}

// 操作类
export const Icons = {
  Add: wrapIcon(Add),
  Edit: wrapIcon(Edit),
  Delete: wrapIcon(Delete),
  Close: wrapIcon(Close),
  Save: wrapIcon(SaveSvg),
  Undo: wrapIcon(Undo),
  Redo: wrapIcon(Redo),
  Copy: wrapIcon(CopySvg),
  Check: wrapIcon(CheckSvg),
  Search: wrapIcon(SearchSvg),
  Filter: wrapIcon(FilterSvg),
  Upload: wrapIcon(UploadSvg),
  Refresh: wrapIcon(Refresh),
  Send: wrapIcon(SendSvg),
  Play: wrapIcon(PlaySvg),
  Minus: wrapIcon(Minus),
} as const;

// 方向类
export const IconsDirection = {
  Right: wrapIcon(Right),
  Down: wrapIcon(Down),
  Left: wrapIcon(Left),
  Up: wrapIcon(Up),
  ArrowLeft: wrapIcon(ArrowLeftSvg),
  ArrowDown: wrapIcon(ArrowDownSvg),
  ArrowUp: wrapIcon(ArrowUpSvg),
} as const;

// 更多/菜单
export const IconsMore = {
  More: wrapIcon(More),
} as const;

// 设置
export const IconsSetting = {
  Setting: wrapIcon(Setting),
} as const;

// 帮助/提示
export const IconsHelp = {
  Help: wrapIcon(Help),
  Tips: wrapIcon(Tips),
} as const;

// 视图/眼睛
export const IconsView = {
  Eyes: wrapIcon(Eyes),
  FileHiding: wrapIcon(FileHiding),
} as const;

// 图表
export const IconsChart = {
  ChartHistogram: wrapIcon(ChartHistogram),
  ChartPie: wrapIcon(ChartPie),
  ChartLine: wrapIcon(ChartLine),
} as const;

// 业务/菜单
export const IconsMenu = {
  Globe: wrapIcon(GlobeSvg),
  Earth: wrapIcon(Earth),
  Message: wrapIcon(MessageSvg),
  Robot: wrapIcon(Robot),
  BuildingTwo: wrapIcon(BuildingTwo),
  Shield: wrapIcon(ShieldIcon),
  People: wrapIcon(PeopleSvg),
  FileText: wrapIcon(FileTextSvg),
  History: wrapIcon(HistorySvg),
  TextStyleOne: wrapIcon(TextStyleOneSvg),
  Table: wrapIcon(TableSvg),
  TableFile: wrapIcon(TableFileSvg),
  Cpu: wrapIcon(CpuSvg),
  Plug: wrapIcon(PlugSvg),
  Mail: wrapIcon(MailSvg),
  MenuUnfold: wrapIcon(MenuUnfold),
  Components: wrapIcon(Components),
  Layers: wrapIcon(LayersSvg),
  LayoutFour: wrapIcon(LayoutFour),
  Key: wrapIcon(KeySvg),
  Drag: wrapIcon(Drag),
  Lock: wrapIcon(LockSvg),
  Database: wrapIcon(DatabaseConfig),
  Rocket: wrapIcon(RocketSvg),
  Lightning: wrapIcon(Lightning),
  Bug: wrapIcon(BugSvg),
  FileCode: wrapIcon(FileCodeSvg),
  Paperclip: wrapIcon(PaperclipSvg),
  Calendar: wrapIcon(Calendar),
  Loading: wrapIcon(Loading),
  Logout: wrapIcon(Logout),
  IndentLeft: wrapIcon(IndentLeft),
  Magic: wrapIcon(Magic),
  BookOpen: wrapIcon(BookOpen),
  TrendingUp: wrapIcon(TrendingUpSvg),
  HeadphoneSound: wrapIcon(HeadphoneSound),
  Info: wrapIcon(Info),
  Octagon: wrapIcon(Octagon),
  Forbid: wrapIcon(Forbid),
  FreezeColumn: wrapIcon(FreezeColumnSvg),
  Communication: wrapIcon(CommunicationSvg),
  Api: wrapIcon(ApiSvg),
  Agreement: wrapIcon(AgreementSvg),
} as const;

// 排序
export const IconsSort = {
  Sort: wrapIcon(Sort),
  SortAmountDown: wrapIcon(SortAmountDown),
  SortAmountUp: wrapIcon(SortAmountUp),
} as const;

// 主题切换
export const IconsTheme = {
  Sun: wrapIcon(SunIcon),
  Moon: wrapIcon(MoonIcon),
  Monitor: wrapIcon(Computer),
} as const;

// ========== 兼容 lucide 的别名导出（便于迁移） ==========
export const Plus = Icons.Add;
export const Pencil = Icons.Edit;
export const Trash2 = Icons.Delete;
export const X = Icons.Close;
export const ChevronRight = IconsDirection.Right;
export const ChevronDown = IconsDirection.Down;
export const ChevronLeft = IconsDirection.Left;
export const ChevronUp = IconsDirection.Up;
export const ChevronDownIcon = IconsDirection.Down;
export const ChevronUpIcon = IconsDirection.Up;
export const ChevronLeftIcon = IconsDirection.Left;
export const ChevronRightIcon = IconsDirection.Right;
export const Settings2 = IconsSetting.Setting;
export const MoreVertical = IconsMore.More;
export const MoreHorizontal = IconsMore.More;
export const HelpCircle = IconsHelp.Help;
export const AlertTriangle = IconsHelp.Tips;
export const MessageSquareText = IconsMenu.Message;
export const BarChart3 = IconsChart.ChartHistogram;
export const PieChartIcon = IconsChart.ChartPie;
export const LineChartIcon = IconsChart.ChartLine;
export const MinusCircle = Icons.Minus;
export const ArrowUpDown = IconsSort.Sort;
export const Eye = IconsView.Eyes;
export const EyeOff = IconsView.FileHiding;
export const CheckCircle = Icons.Check;
export const RotateCcw = Icons.Refresh;
export const CircleSlash = Icons.Close;
export const Loader2 = IconsMenu.Loading;
export const CalendarIcon = IconsMenu.Calendar;
export const Building2 = IconsMenu.BuildingTwo;
export const Users = IconsMenu.People;
export const UserCog = IconsMenu.People; // IconPark 无 UserCog，用 People 近似
export const UserCheck = Icons.Check; // 组合表示
export const Menu = IconsMenu.MenuUnfold;
export const Puzzle = IconsMenu.Components;
export const GripVertical = IconsMenu.Drag;
export const Table2 = IconsMenu.Table;
export const Sun = IconsTheme.Sun;
export const Moon = IconsTheme.Moon;
export const Monitor = IconsTheme.Monitor;
export const CheckIcon = Icons.Check;
export const CircleIcon = wrapIcon(Dot);
export const LogOut = IconsMenu.Logout;
export const PanelLeft = IconsMenu.IndentLeft;
export const Sparkles = IconsMenu.Magic;
export const BookOpenText = IconsMenu.BookOpen;
export const Shield = IconsMenu.Shield;
export const Check = Icons.Check;
export const Table = IconsMenu.Table;
export const TableFile = IconsMenu.TableFile;
export const ArrowDown = IconsDirection.ArrowDown;
export const ArrowUp = IconsDirection.ArrowUp;
export const Message = IconsMenu.Message;
export const People = IconsMenu.People;
export const Layers = IconsMenu.Layers;
export const FileText = IconsMenu.FileText;
export const History = IconsMenu.History;
export const TextStyleOne = IconsMenu.TextStyleOne;
export const Cpu = IconsMenu.Cpu;
export const Plug = IconsMenu.Plug;
export const Mail = IconsMenu.Mail;
export const Zap = IconsMenu.Lightning; // Lightning 即 Zap
export const Settings = IconsSetting.Setting;
export const Database = IconsMenu.Database;
export const MessageSquare = IconsMenu.Message;
export const Undo2 = Icons.Undo;
export const Redo2 = Icons.Redo;
export const RefreshCw = Icons.Refresh;
export const Bot = IconsMenu.Robot;
export const TrendingUp = IconsMenu.TrendingUp;
export const Headphones = IconsMenu.HeadphoneSound;
export const CircleCheckIcon = Icons.Check;
export const InfoIcon = IconsMenu.Info;
export const TriangleAlertIcon = IconsHelp.Tips;
export const OctagonXIcon = Icons.Close;
export const Loader2Icon = IconsMenu.Loading;
export const KeyRound = IconsMenu.Key;
export const ShieldOff = IconsMenu.Forbid;
export const LayoutGrid = IconsMenu.LayoutFour;
export const Copy = Icons.Copy;
export const Key = IconsMenu.Key;
export const Globe = IconsMenu.Globe;
export const FileCode = IconsMenu.FileCode;
export const Paperclip = IconsMenu.Paperclip;
export const Search = Icons.Search;
export const Send = Icons.Send;
export const Save = Icons.Save;
export const Upload = Icons.Upload;
export const Filter = Icons.Filter;
export const Bug = IconsMenu.Bug;
export const Play = Icons.Play;
export const ArrowLeft = IconsDirection.ArrowLeft;
export const Rocket = IconsMenu.Rocket;
export const Lock = IconsMenu.Lock;
export const FreezeColumn = IconsMenu.FreezeColumn;
export const Communication = IconsMenu.Communication;
export const Api = IconsMenu.Api;
export const Agreement = IconsMenu.Agreement;