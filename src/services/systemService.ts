import { invoke } from '@tauri-apps/api/core';
import { getVersion, getTauriVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface SystemInfo {
  osName: string;
  osVersion: string;
}

export interface AppInfo {
  appVersion: string;
  tauriVersion: string;
  architecture: string;
  system: SystemInfo;
}

const UNKNOWN: AppInfo = {
  appVersion: '',
  tauriVersion: '',
  architecture: '',
  system: { osName: 'Unknown', osVersion: '' },
};

async function getAppInfo(): Promise<AppInfo> {
  try {
    const [appVersion, tauriVersion, system, architecture] = await Promise.all([
      getVersion(),
      getTauriVersion(),
      invoke<{ os_name: string; os_version: string }>('get_system_info'),
      invoke<string>('get_arch'),
    ]);

    return {
      appVersion,
      tauriVersion,
      architecture,
      system: { osName: system.os_name, osVersion: system.os_version },
    };
  } catch (error) {
    console.error('Failed to load app info:', error);
    return UNKNOWN;
  }
}

async function setWindowTitle(title: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(title);
  } catch (error) {
    console.error('Failed to set the window title:', error);
  }
}

export const systemService = {
  getAppInfo,
  setWindowTitle,
};
