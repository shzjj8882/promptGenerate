import { makeAutoObservable } from "mobx";
import { UserInfo } from "@/lib/api/auth";
import { MenuItem } from "@/lib/api/rbac";

class UserStore {
  user: UserInfo | null = null;
  loading = false;
  menuTree: MenuItem[] = [];
  menuTreeLoading = false;

  constructor() {
    makeAutoObservable(this);
    // 从 localStorage 恢复用户信息（如果有）
    if (typeof window !== "undefined") {
      const storedUser = localStorage.getItem("user_info");
      if (storedUser) {
        try {
          this.user = JSON.parse(storedUser);
        } catch (e) {
          console.error("Failed to parse stored user info:", e);
          localStorage.removeItem("user_info");
        }
      }
    }
  }

  setUser(user: UserInfo | null) {
    this.user = user;
    // 同步到 localStorage
    if (typeof window !== "undefined") {
      if (user) {
        localStorage.setItem("user_info", JSON.stringify(user));
      } else {
        localStorage.removeItem("user_info");
      }
    }
    // 用户变化时清空菜单树，需要重新获取
    if (!user) {
      this.menuTree = [];
    }
  }

  setLoading(loading: boolean) {
    this.loading = loading;
  }

  setMenuTree(menuTree: MenuItem[]) {
    this.menuTree = menuTree;
  }

  setMenuTreeLoading(loading: boolean) {
    this.menuTreeLoading = loading;
  }

  clearUser() {
    this.setUser(null);
    this.menuTree = [];
  }

  get isAuthenticated() {
    return this.user !== null;
  }

  get displayName() {
    if (!this.user) return "";
    return this.user.full_name || this.user.username;
  }
}

export const userStore = new UserStore();

