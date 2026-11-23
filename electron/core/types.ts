export type HostPlatform = 'win32' | 'darwin' | 'linux';
export type BuildSystem = 'makefile' | 'cmake';
export type ProjectKind = 'stm32' | 'arm-generic' | 'riscv' | 'custom-mcu' | 'generic-c';
export type DebuggerType = 'none' | 'openocd' | 'jlink' | 'stlink' | 'pyocd' | 'gdb-host' | 'custom';
export type OptimizationLevel = '-O0' | '-O1' | '-O2' | '-O3' | '-Os' | '-Og';

export interface SourceGroup {
  id: string;
  name: string;
  files: string[]; // POSIX relative paths from projectDir
}

export interface ToolchainConfig {
  /** Custom or auto-detected compiler bin directory (e.g. C:/.../bin) */
  compilerDir: string;
  /** Compiler prefix (e.g. "arm-none-eabi-", "riscv-none-elf-", or "" for native gcc/clang/custom) */
  prefix: string;
  /** Explicit C compiler executable override (for unknown/custom MCU compilers) */
  ccExecutable: string;
  /** Explicit C++ compiler executable override */
  cxxExecutable: string;
  /** Explicit assembler executable override */
  asExecutable: string;
  /** Explicit linker executable override */
  ldExecutable: string;
  /** Explicit objcopy executable override */
  objcopyExecutable: string;
  /** Explicit size executable override */
  sizeExecutable: string;
  /** Explicit gdb executable override */
  gdbExecutable: string;
  /** Make executable path */
  makeExecutable: string;
  /** CMake executable path */
  cmakeExecutable: string;
  /** Ninja executable path (optional for CMake) */
  ninjaExecutable: string;
  /** Extra system include dir (e.g. ARM_INCLUDE) */
  sysIncludeDir: string;
}

export interface DebuggerConfig {
  type: DebuggerType;
  /** Executable path (openocd, JLinkGDBServer, ST-LINK_gdbserver, pyocd, or custom flasher) */
  serverPath: string;
  /** OpenOCD scripts directory (optional) */
  openocdScriptsDir: string;
  /** OpenOCD interface cfg (e.g. interface/stlink.cfg, interface/cmsis-dap.cfg, interface/jlink.cfg) */
  openocdInterface: string;
  /** OpenOCD target cfg (e.g. target/stm32f1x.cfg, target/stm32f4x.cfg, target/stm32h7x.cfg) */
  openocdTarget: string;
  /** J-Link / PyOCD device name (e.g. STM32F103RE) */
  deviceName: string;
  /** SWD / JTAG */
  interfaceMode: 'swd' | 'jtag';
  /** SVD file relative or absolute path for peripheral register view in Cortex-Debug */
  svdFile: string;
  /** Custom flash command template (supports ${ELF}, ${HEX}, ${BIN}, ${TARGET}) */
  customFlashCommand: string;
  /** Custom debug server args */
  customDebugArgs: string;
}

export interface BuildFlagsConfig {
  cpuFlags: string;       // e.g. "-mcpu=cortex-m3 -mthumb -mfloat-abi=soft"
  cStandard: string;      // e.g. "gnu11", "c11", "c99", "gnu99"
  cxxStandard: string;    // e.g. "gnu++17", "c++17"
  optimization: OptimizationLevel;
  debugInfo: string;      // e.g. "-g3", "-g", ""
  warnings: string;       // e.g. "-Wall"
  extraCFlags: string;    // e.g. "-ffunction-sections -fdata-sections -fno-strict-aliasing"
  extraAsFlags: string;
  extraLdFlags: string;   // e.g. "--specs=nano.specs -Wl,--gc-sections"
  libs: string;           // e.g. "-lc -lm -u _printf_float"
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
  flashOrigin: string; // e.g. "0x08000000" or "0x08008000"
  flashLength: string; // e.g. "512K" or "32K"
  ramOrigin: string;   // e.g. "0x20000000"
  ramLength: string;   // e.g. "64K"
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
  linkerScript: string; // POSIX relative path or empty for generic C
  memoryLayout?: MemoryLayoutConfig;
  protectExistingBuildFile?: boolean;
  /** Separate machine-specific paths into local.mk for Git / Win+Mac+Linux teamwork */
  useLocalMk?: boolean;
  defines: string[];
  includeDirs: string[]; // POSIX relative paths
  sourceGroups: SourceGroup[];
  /** Files kept in tree but excluded from compilation (like Keil Exclude from Build) */
  disabledFiles?: string[];
  /** Static libraries (.a) and library search dirs (-L) */
  staticLibs?: string[];
  libSearchDirs?: string[];
  asmSources: string[];  // POSIX relative paths
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
  subDir: string;      // empty if single program at root, else e.g. "bootloader" / "app"
  flashOrigin: string; // optional, e.g. "0x08000000"
  flashLength: string; // optional, e.g. "32K"
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
