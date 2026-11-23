import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { detectEnvironment } from './core/detector';
import {
  createNewProject,
  createNewWorkspace,
  createProgramSegment,
  importProjectDirectory,
  importWorkspaceDirectory,
  NewProjectOptions,
  saveWorkspaceMeta,
} from './core/parser';
import { importKeilUvprojx } from './core/keilParser';
import { analyzeElfMemory, mergeWorkspaceFirmware } from './core/firmwareTools';
import { scanDirectory } from './core/scanner';
import { applyGeneratedFiles, buildGeneratedPreviews } from './core/generator';
import { runBatchBuild, runProjectAction, stopActiveCommand } from './core/runner';
import { McuProjectConfig, NewProgramSegment, NewWorkspaceOptions } from './core/types';
import { toRelativePosix } from './core/platform';

let mainWindow: BrowserWindow | null = null;

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../dist/logo.png'),
    path.join(__dirname, '../public/logo.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function createWindow(): void {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0b0f16',
    title: 'MCU Forge Studio',
    icon: resolveAppIcon(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0b0f16',
      symbolColor: '#e6edf3',
      height: 46,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopActiveCommand();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ======================== IPC Handlers ========================

ipcMain.handle('env:detect', () => {
  return detectEnvironment();
});

ipcMain.handle('dialog:selectDir', async (_ev, title?: string) => {
  const res = await dialog.showOpenDialog({
    title: title || '选择文件夹',
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle(
  'dialog:selectFiles',
  async (_ev, opts?: { title?: string; multi?: boolean; filters?: Electron.FileFilter[]; defaultPath?: string }) => {
    const props: Array<'openFile' | 'multiSelections'> = ['openFile'];
    if (opts?.multi) props.push('multiSelections');
    const res = await dialog.showOpenDialog({
      title: opts?.title || '选择文件',
      defaultPath: opts?.defaultPath,
      filters: opts?.filters,
      properties: props,
    });
    return res.canceled ? [] : res.filePaths;
  }
);

ipcMain.handle('project:import', (_ev, dirPath: string) => {
  const env = detectEnvironment();
  return importProjectDirectory(dirPath, env);
});

ipcMain.handle('workspace:import', (_ev, dirPath: string) => {
  const env = detectEnvironment();
  return importWorkspaceDirectory(dirPath, env);
});

ipcMain.handle('keil:importUvprojx', (_ev, uvprojxPath: string) => {
  const env = detectEnvironment();
  return importKeilUvprojx(uvprojxPath, env);
});

ipcMain.handle('project:create', (_ev, options: NewProjectOptions) => {
  const env = detectEnvironment();
  const config = createNewProject(options, env);
  const result = applyGeneratedFiles(config);
  return { config, ...result };
});

ipcMain.handle('workspace:create', (_ev, options: NewWorkspaceOptions) => {
  const env = detectEnvironment();
  const workspace = createNewWorkspace(options, env);
  let writtenCount = 0;
  for (const prog of workspace.programs) {
    const res = applyGeneratedFiles(prog);
    writtenCount += res.written.length;
  }
  return { workspace, writtenCount };
});

ipcMain.handle(
  'workspace:addProgramSegment',
  (
    _ev,
    workspaceDir: string,
    template: McuProjectConfig,
    segment: NewProgramSegment,
    createStarterFiles: boolean
  ) => {
    const env = detectEnvironment();
    const config = createProgramSegment(
      workspaceDir,
      {
        projectKind: template.projectKind,
        buildSystem: template.buildSystem,
        cpuFlags: template.flags.cpuFlags,
        debuggerType: template.debugger.type,
        createStarterFiles,
        segment,
      },
      env
    );
    const res = applyGeneratedFiles(config);
    return { config, written: res.written };
  }
);

ipcMain.handle('workspace:saveMeta', (_ev, workspaceDir: string, programDirs: string[]) => {
  saveWorkspaceMeta(workspaceDir, programDirs);
  return { ok: true };
});

ipcMain.handle(
  'project:scanDir',
  (_ev, projectDir: string, targetDir: string, excludedDirs?: string[]) => {
    return scanDirectory(projectDir, targetDir, excludedDirs);
  }
);

ipcMain.handle('project:toRelative', (_ev, projectDir: string, paths: string[]) => {
  return paths.map((p) => toRelativePosix(projectDir, p));
});

ipcMain.handle('project:preview', (_ev, config: McuProjectConfig) => {
  return buildGeneratedPreviews(config);
});

ipcMain.handle('project:apply', (_ev, config: McuProjectConfig) => {
  return applyGeneratedFiles(config);
});

ipcMain.handle(
  'project:run',
  (_ev, config: McuProjectConfig, action: 'build' | 'clean' | 'flash' | 'rebuild') => {
    runProjectAction(config, action, (event) => {
      mainWindow?.webContents.send('runner:event', event);
    });
    return { started: true };
  }
);

ipcMain.handle('workspace:buildAll', (_ev, programs: McuProjectConfig[]) => {
  runBatchBuild(programs, (event) => {
    mainWindow?.webContents.send('runner:event', event);
  });
  return { started: true };
});

ipcMain.handle('project:stop', () => {
  return stopActiveCommand();
});

ipcMain.handle('workspace:mergeFirmware', (_ev, workspaceDir: string, programs: McuProjectConfig[]) => {
  return mergeWorkspaceFirmware(workspaceDir, programs);
});

ipcMain.handle('project:analyzeMemory', (_ev, config: McuProjectConfig) => {
  return analyzeElfMemory(config);
});

ipcMain.handle('shell:openInVscode', (_ev, dirPath: string) => {
  const cmd = process.platform === 'win32' ? 'code.cmd' : 'code';
  try {
    const child = spawn(cmd, [dirPath], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
});

ipcMain.handle(
  'shell:openFileInVscode',
  (_ev, projectDir: string, filePath: string, line?: number, col?: number) => {
    const cmd = process.platform === 'win32' ? 'code.cmd' : 'code';
    const absFile = path.isAbsolute(filePath) ? filePath : path.resolve(projectDir, filePath);
    const target = line ? `${absFile}:${line}${col ? `:${col}` : ''}` : absFile;
    try {
      const child = spawn(cmd, ['-g', target], {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      child.unref();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
);

ipcMain.handle('shell:openFolder', async (_ev, dirPath: string) => {
  await shell.openPath(dirPath);
  return { ok: true };
});
