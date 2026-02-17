import { makeAutoObservable } from "mobx";

class UiStore {
  sidebarCollapsed = false;
  /** 工作台是否处于配置中（配置中可增删移，非配置中仅展示） */
  dashboardConfigMode = false;
  /** 配置侧边栏是否展开（仅配置中有效） */
  dashboardConfigSidebarOpen = true;

  constructor() {
    makeAutoObservable(this);
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  setSidebarCollapsed(value: boolean) {
    this.sidebarCollapsed = value;
  }

  /** 进入配置模式：打开侧边栏 */
  enterDashboardConfig() {
    this.dashboardConfigMode = true;
    this.dashboardConfigSidebarOpen = true;
  }

  /** 退出配置模式：关闭侧边栏 */
  exitDashboardConfig() {
    this.dashboardConfigMode = false;
    this.dashboardConfigSidebarOpen = false;
  }

  toggleDashboardConfig() {
    if (this.dashboardConfigMode) {
      this.exitDashboardConfig();
    } else {
      this.enterDashboardConfig();
    }
  }

  setDashboardConfigSidebarOpen(value: boolean) {
    this.dashboardConfigSidebarOpen = value;
  }

  toggleDashboardConfigSidebar() {
    this.dashboardConfigSidebarOpen = !this.dashboardConfigSidebarOpen;
  }
}

export const uiStore = new UiStore();


