export type HostPlatform = 'win32' | 'darwin' | 'linux';
export type BuildSystem = 'makefile' | 'cmake';
export type ProjectKind = 'stm32' | 'arm-generic' | 'riscv' | 'custom-mcu' | 'generic-c';
export type DebuggerType = 'none' | 'openocd' | 'jlink' | 'stlink' | 'pyocd' | 'gdb-host' | 'custom';
export type OptimizationLevel = '-O0' | '-O1' | '-O2' | '-O3' | '-Os' | '-Og';

export interface SourceGroup {
  id: string;
  name: string;
  files: string[];
}

export interface ToolchainConfig {
  compilerDir: string;
  prefix: string;
  ccExecutable: string;
  cxxExecutable: string;
  asExecutable: string;
  ldExecutable: string;
  objcopyExecutable: string;
  sizeExecutable: string;
  gdbExecutable: string;
  makeExecutable: string;
  cmakeExecutable: string;
  ninjaExecutable: string;
  sysIncludeDir: string;
}

export interface DebuggerConfig {
  type: DebuggerType;
  serverPath: string;
  openocdScriptsDir: string;
  openocdInterface: string;
  openocdTarget: string;
  deviceName: string;
  interfaceMode: 'swd' | 'jtag';
  svdFile: string;
  customFlashCommand: string;
  customDebugArgs: string;
}

export interface BuildFlagsConfig {
  cpuFlags: string;
  cStandard: string;
  cxxStandard: string;
  optimization: OptimizationLevel;
  debugInfo: string;
  warnings: string;
  extraCFlags: string;
  extraAsFlags: string;
  extraLdFlags: string;
  libs: string;
  parallelJobs: number;
  generateHex: boolean;
  generateBin: boolean;
}

export interface IdeIntegrationConfig {
  generateCompileCommands: boolean;
  generateClangd: boolean;
  generateVscodeTasks: boolean;
  generateVscodeLaunch: boolean;
  generateVscodeSettings: boolean;
  generateVscodeExtensions: boolean;
  clangdExtraArgs: string[];
  backupBeforeOverwrite: boolean;
}

export interface MemoryLayoutConfig {
  flashOrigin: string;
  flashLength: string;
  ramOrigin: string;
  ramLength: string;
}

export interface BuildHooksConfig {
  preBuild: string;
  postBuild: string;
}

export interface McuProjectConfig {
  schemaVersion: number;
  projectDir: string;
  name: string;
  projectKind: ProjectKind;
  buildSystem: BuildSystem;
  buildDir: string;
  linkerScript: string;
  memoryLayout?: MemoryLayoutConfig;
  protectExistingBuildFile?: boolean;
  useLocalMk?: boolean;
  defines: string[];
  includeDirs: string[];
  sourceGroups: SourceGroup[];
  disabledFiles?: string[];
  staticLibs?: string[];
  libSearchDirs?: string[];
  asmSources: string[];
  excludedDirs: string[];
  hooks?: BuildHooksConfig;
  toolchain: ToolchainConfig;
  debugger: DebuggerConfig;
  flags: BuildFlagsConfig;
  ide: IdeIntegrationConfig;
}

export interface SymbolEntry {
  name: string;
  size: number;
  type: string;
  address: string;
  region: 'flash' | 'ram';
}

export interface MemoryAnalysisReport {
  elfPath: string;
  flashUsed: number;
  ramUsed: number;
  textBytes: number;
  dataBytes: number;
  bssBytes: number;
  topFlash: SymbolEntry[];
  topRam: SymbolEntry[];
  source: 'nm' | 'map';
}

export interface MergeFirmwareResult {
  binPath: string;
  hexPath: string;
  baseAddress: number;
  totalBytes: number;
  segments: Array<{
    name: string;
    origin: string;
    size: number;
    binFile: string;
  }>;
}

export interface WorkspaceState {
  workspaceDir: string;
  programs: McuProjectConfig[];
  activeIndex: number;
  importSummary?: string;
}

export interface NewProgramSegment {
  name: string;
  subDir: string;
  flashOrigin: string;
  flashLength: string;
}

export interface NewWorkspaceOptions {
  parentDir: string;
  workspaceName: string;
  projectKind: ProjectKind;
  buildSystem: BuildSystem;
  cpuFlags?: string;
  debuggerType?: DebuggerType;
  createStarterFiles: boolean;
  segments: NewProgramSegment[];
}

export interface DetectedTool {
  name: string;
  category: 'compiler' | 'build' | 'debugger' | 'ide';
  path: string;
  dir: string;
  prefix?: string;
  version?: string;
}

export interface EnvironmentReport {
  platform: HostPlatform;
  arch: string;
  tools: DetectedTool[];
}

export interface GeneratedFilePreview {
  relativePath: string;
  absolutePath: string;
  content: string;
  existed: boolean;
}

export interface ScanResult {
  cSources: string[];
  cppSources: string[];
  asmSources: string[];
  includeDirs: string[];
  linkerScripts: string[];
  svdFiles: string[];
}

export interface RunCommandEvent {
  type: 'stdout' | 'stderr' | 'info' | 'exit';
  data: string;
  exitCode?: number;
  memoryUsage?: {
    text: number;
    data: number;
    bss: number;
    dec: number;
  };
}

export interface NewProjectOptions {
  parentDir: string;
  name: string;
  projectKind: ProjectKind;
  buildSystem: BuildSystem;
  cpuFlags?: string;
  debuggerType?: DebuggerType;
  createStarterFiles: boolean;
}

export interface McuForgeApi {
  detectEnvironment: () => Promise<EnvironmentReport>;
  selectDir: (title?: string) => Promise<string | null>;
  selectFiles: (opts?: {
    title?: string;
    multi?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }) => Promise<string[]>;
  importProject: (dirPath: string) => Promise<{ config: McuProjectConfig; importSource: string }>;
  importWorkspace: (dirPath: string) => Promise<WorkspaceState>;
  importKeilUvprojx: (uvprojxPath: string) => Promise<WorkspaceState>;
  createProject: (options: NewProjectOptions) => Promise<{
    config: McuProjectConfig;
    written: string[];
    backedUp: string[];
  }>;
  createWorkspace: (options: NewWorkspaceOptions) => Promise<{
    workspace: WorkspaceState;
    writtenCount: number;
  }>;
  addProgramSegment: (
    workspaceDir: string,
    template: McuProjectConfig,
    segment: NewProgramSegment,
    createStarterFiles: boolean
  ) => Promise<{ config: McuProjectConfig; written: string[] }>;
  saveWorkspaceMeta: (workspaceDir: string, programDirs: string[]) => Promise<{ ok: boolean }>;
  scanDir: (projectDir: string, targetDir: string, excludedDirs?: string[]) => Promise<ScanResult>;
  toRelative: (projectDir: string, paths: string[]) => Promise<string[]>;
  previewGenerated: (config: McuProjectConfig) => Promise<GeneratedFilePreview[]>;
  applyGenerated: (config: McuProjectConfig) => Promise<{ written: string[]; backedUp: string[] }>;
  runAction: (config: McuProjectConfig, action: 'build' | 'clean' | 'flash' | 'rebuild') => Promise<{ started: boolean }>;
  runBuildAll: (programs: McuProjectConfig[]) => Promise<{ started: boolean }>;
  stopAction: () => Promise<boolean>;
  mergeFirmware: (workspaceDir: string, programs: McuProjectConfig[]) => Promise<MergeFirmwareResult>;
  analyzeMemory: (config: McuProjectConfig) => Promise<MemoryAnalysisReport>;
  openInVscode: (dirPath: string) => Promise<{ ok: boolean; error?: string }>;
  openFileInVscode: (projectDir: string, filePath: string, line?: number, col?: number) => Promise<{ ok: boolean; error?: string }>;
  openFolder: (dirPath: string) => Promise<{ ok: boolean }>;
  onRunnerEvent: (cb: (ev: RunCommandEvent) => void) => () => void;
}

declare global {
  interface Window {
    mcuForge: McuForgeApi;
  }
}
