/**
 * 场景相关 API
 */

import { apiRequest } from "./config";

export interface Scene {
  id: string;
  code: string;
  name: string;
  is_predefined?: boolean; // 是否是预置场景
  team_code?: string | null; // 团队代码，null表示系统创建的场景
}

export interface PlaceholderItem {
  key: string;
  label: string;
  description?: string;
}

export interface SceneCreate {
  code: string;
  name: string;
  placeholders?: PlaceholderItem[]; // 可选的占位符列表
}

export interface SceneUpdate {
  name: string; // 只允许修改名称，code不允许修改
  placeholders?: PlaceholderItem[]; // 可选的占位符列表
}

export async function getScenes(): Promise<Scene[]> {
  return apiRequest<Scene[]>("/admin/scenes");
}

export async function createScene(scene: SceneCreate): Promise<Scene> {
  return apiRequest<Scene>("/admin/scenes", {
    method: "POST",
    body: JSON.stringify(scene),
  });
}

export async function updateScene(sceneCode: string, scene: SceneUpdate): Promise<Scene> {
  return apiRequest<Scene>(`/admin/scenes/${sceneCode}`, {
    method: "PUT",
    body: JSON.stringify(scene),
  });
}

export async function deleteScene(sceneCode: string): Promise<Scene> {
  return apiRequest<Scene>(`/admin/scenes/${sceneCode}`, {
    method: "DELETE",
  });
}


