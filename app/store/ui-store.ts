import { makeAutoObservable } from "mobx";

class UiStore {
  sidebarCollapsed = false;

  constructor() {
    makeAutoObservable(this);
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  setSidebarCollapsed(value: boolean) {
    this.sidebarCollapsed = value;
  }
}

export const uiStore = new UiStore();


