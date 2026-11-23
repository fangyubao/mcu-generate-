import { contextBridge, ipcRenderer } from 'electron';
import { McuProjectConfig, NewProgramSegment, NewWorkspaceOptions, RunCommandEvent } from './core/types';
import { NewProjectOptions } from './core/parser';

const api = {
  detectEnvironment: () => ipcRenderer.invoke('env:detect'),
  selectDir: (title?: string) => ipcRenderer.invoke('dialog:selectDir', title),
  selectFiles: (opts?: {
    title?: string;
    multi?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }) => ipcRenderer.invoke('dialog:selectFiles', opts),
  importProject: (dirPath: string) => ipcRenderer.invoke('project:import', dirPath),
  importWorkspace: (dirPath: string) => ipcRenderer.invoke('workspace:import', dirPath),
  importKeilUvprojx: (uvprojxPath: string) => ipcRenderer.invoke('keil:importUvprojx', uvprojxPath),
  createProject: (options: NewProjectOptions) => ipcRenderer.invoke('project:create', options),
  createWorkspace: (options: NewWorkspaceOptions) => ipcRenderer.invoke('workspace:create', options),
  addProgramSegment: (
    workspaceDir: string,
    template: McuProjectConfig,
    segment: NewProgramSegment,
    createStarterFiles: boolean
  ) => ipcRenderer.invoke('workspace:addProgramSegment', workspaceDir, template, segment, createStarterFiles),
  saveWorkspaceMeta: (workspaceDir: string, programDirs: string[]) =>
    ipcRenderer.invoke('workspace:saveMeta', workspaceDir, programDirs),
  scanDir: (projectDir: string, targetDir: string, excludedDirs?: string[]) =>
    ipcRenderer.invoke('project:scanDir', projectDir, targetDir, excludedDirs),
  toRelative: (projectDir: string, paths: string[]) =>
    ipcRenderer.invoke('project:toRelative', projectDir, paths),
  previewGenerated: (config: McuProjectConfig) => ipcRenderer.invoke('project:preview', config),
  applyGenerated: (config: McuProjectConfig) => ipcRenderer.invoke('project:apply', config),
  runAction: (config: McuProjectConfig, action: 'build' | 'clean' | 'flash' | 'rebuild') =>
    ipcRenderer.invoke('project:run', config, action),
  runBuildAll: (programs: McuProjectConfig[]) => ipcRenderer.invoke('workspace:buildAll', programs),
  stopAction: () => ipcRenderer.invoke('project:stop'),
  mergeFirmware: (workspaceDir: string, programs: McuProjectConfig[]) =>
    ipcRenderer.invoke('workspace:mergeFirmware', workspaceDir, programs),
  analyzeMemory: (config: McuProjectConfig) => ipcRenderer.invoke('project:analyzeMemory', config),
  openInVscode: (dirPath: string) => ipcRenderer.invoke('shell:openInVscode', dirPath),
  openFileInVscode: (projectDir: string, filePath: string, line?: number, col?: number) =>
    ipcRenderer.invoke('shell:openFileInVscode', projectDir, filePath, line, col),
  openFolder: (dirPath: string) => ipcRenderer.invoke('shell:openFolder', dirPath),
  onRunnerEvent: (cb: (ev: RunCommandEvent) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: RunCommandEvent) => cb(ev);
    ipcRenderer.on('runner:event', listener);
    return () => ipcRenderer.removeListener('runner:event', listener);
  },
};

contextBridge.exposeInMainWorld('mcuForge', api);
