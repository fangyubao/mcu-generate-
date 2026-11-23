import * as fs from 'fs';
import * as path from 'path';
import {
  BuildSystem,
  EnvironmentReport,
  McuProjectConfig,
  MemoryLayoutConfig,
  NewProgramSegment,
  NewWorkspaceOptions,
  OptimizationLevel,
  ProjectKind,
  WorkspaceState,
} from './types';
import { DEFAULT_EXCLUDED_DIRS, groupSourcesByFolder, scanDirectory } from './scanner';
import { toPosixPath, toRelativePosix } from './platform';

export const MCU_FORGE_CONFIG_FILE = 'mcu-forge.json';
export const MCU_FORGE_WORKSPACE_FILE = 'mcu-forge-workspace.json';

/** Try parsing FLASH & RAM ORIGIN/LENGTH from GNU linker script (.ld) */
export function parseLinkerMemoryLayout(ldFilePath: string): MemoryLayoutConfig | undefined {
  try {
    if (!fs.existsSync(ldFilePath)) return undefined;
    const text = fs.readFileSync(ldFilePath, 'utf8');
    const flashMatch = text.match(/FLASH[^:]*:\s*ORIGIN\s*=\s*(0x[0-9a-fA-F]+)\s*,\s*LENGTH\s*=\s*([0-9a-zA-Z]+)/i);
    const ramMatch = text.match(/RAM[^:]*:\s*ORIGIN\s*=\s*(0x[0-9a-fA-F]+)\s*,\s*LENGTH\s*=\s*([0-9a-zA-Z]+)/i);
    if (!flashMatch && !ramMatch) return undefined;
    return {
      flashOrigin: flashMatch?.[1] || '0x08000000',
      flashLength: flashMatch?.[2] || '',
      ramOrigin: ramMatch?.[1] || '0x20000000',
      ramLength: ramMatch?.[2] || '',
    };
  } catch {
    return undefined;
  }
}

/** Parse Makefile variable assignments, including backslash-continued multiline blocks */
export function parseMakefileVariables(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];
    // Join continuation lines ending with '\'
    while (line.trimEnd().endsWith('\\') && i + 1 < lines.length) {
      line = line.trimEnd().slice(0, -1) + ' ' + lines[++i].trim();
    }
    i++;

    const stripped = line.replace(/#.*$/, '').trim();
    if (!stripped) continue;

    const match = stripped.match(/^([A-Za-z0-9_.-]+)\s*(\+?=|:=|\?=)\s*(.*)$/);
    if (!match) continue;

    const [, key, op, rawVal] = match;
    const val = rawVal.trim();
    if (op === '+=' && vars[key]) {
      vars[key] = `${vars[key]} ${val}`.trim();
    } else {
      vars[key] = val;
    }
  }
  return vars;
}

function splitTokens(raw: string | undefined): string[] {
  if (!raw) return [];
  // Remove simple $(if ...) expressions that are dynamic
  const cleaned = raw.replace(/\$\([^)]+\)/g, ' ');
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function createBaseConfig(
  projectDir: string,
  name: string,
  projectKind: ProjectKind,
  buildSystem: BuildSystem,
  env?: EnvironmentReport
): McuProjectConfig {
  const armGcc = env?.tools.find((t) => t.prefix === 'arm-none-eabi-');
  const riscvGcc = env?.tools.find((t) => t.prefix?.startsWith('riscv'));
  const nativeGcc = env?.tools.find((t) => t.category === 'compiler' && t.prefix === '');
  const makeTool = env?.tools.find((t) => t.name.startsWith('GNU Make') || t.name.startsWith('MinGW Make'));
  const cmakeTool = env?.tools.find((t) => t.name.startsWith('CMake'));
  const ninjaTool = env?.tools.find((t) => t.name.startsWith('Ninja'));
  const openocdTool = env?.tools.find((t) => t.name === 'OpenOCD');

  const isArm = projectKind === 'stm32' || projectKind === 'arm-generic';
  const isRiscv = projectKind === 'riscv';
  const isGenericC = projectKind === 'generic-c';

  let compilerDir = '';
  let prefix = '';
  let ccExecutable = '';
  if (isArm) {
    compilerDir = armGcc?.dir || '';
    prefix = 'arm-none-eabi-';
  } else if (isRiscv) {
    compilerDir = riscvGcc?.dir || '';
    prefix = riscvGcc?.prefix || 'riscv-none-elf-';
  } else if (isGenericC) {
    compilerDir = nativeGcc?.dir || '';
    prefix = '';
    ccExecutable = nativeGcc?.path || 'gcc';
  }

  let openocdScriptsDir = '';
  if (openocdTool?.path) {
    const candidate = path.resolve(path.dirname(openocdTool.path), '..', 'share', 'openocd', 'scripts');
    if (fs.existsSync(candidate)) {
      openocdScriptsDir = toPosixPath(candidate);
    }
  }

  return {
    schemaVersion: 1,
    projectDir: toPosixPath(projectDir),
    name,
    projectKind,
    buildSystem,
    buildDir: 'build',
    linkerScript: '',
    defines: projectKind === 'stm32' ? ['USE_HAL_DRIVER'] : [],
    includeDirs: [],
    sourceGroups: [],
    asmSources: [],
    excludedDirs: [...DEFAULT_EXCLUDED_DIRS],
    toolchain: {
      compilerDir,
      prefix,
      ccExecutable,
      cxxExecutable: '',
      asExecutable: '',
      ldExecutable: '',
      objcopyExecutable: '',
      sizeExecutable: '',
      gdbExecutable: '',
      makeExecutable: makeTool?.path || 'make',
      cmakeExecutable: cmakeTool?.path || 'cmake',
      ninjaExecutable: ninjaTool?.path || '',
      sysIncludeDir: '',
    },
    debugger: {
      type: isGenericC ? 'gdb-host' : openocdTool ? 'openocd' : 'none',
      serverPath: openocdTool?.path || '',
      openocdScriptsDir,
      openocdInterface: isArm ? 'interface/stlink.cfg' : '',
      openocdTarget: projectKind === 'stm32' ? 'target/stm32f1x.cfg' : '',
      deviceName: '',
      interfaceMode: 'swd',
      svdFile: '',
      customFlashCommand: '',
      customDebugArgs: '',
    },
    flags: {
      cpuFlags: isArm ? '-mcpu=cortex-m3 -mthumb -mfloat-abi=soft' : isRiscv ? '-march=rv32imac -mabi=ilp32' : '',
      cStandard: 'gnu11',
      cxxStandard: 'gnu++17',
      optimization: isGenericC ? '-O0' : '-O2',
      debugInfo: '-g3',
      warnings: '-Wall',
      extraCFlags: isGenericC ? '' : '-ffunction-sections -fdata-sections -fno-strict-aliasing',
      extraAsFlags: '',
      extraLdFlags: isGenericC
        ? ''
        : isArm
          ? '--specs=nano.specs -Wl,--gc-sections -Wl,--no-warn-rwx-segments'
          : '-Wl,--gc-sections',
      libs: isGenericC ? '-lm' : isArm ? '-Wl,--start-group -lc -lm -Wl,--end-group -u _printf_float' : '-lc -lm',
      parallelJobs: 8,
      generateHex: !isGenericC,
      generateBin: !isGenericC,
    },
    ide: {
      generateCompileCommands: true,
      generateClangd: true,
      generateVscodeTasks: true,
      generateVscodeLaunch: true,
      generateVscodeSettings: true,
      generateVscodeExtensions: true,
      clangdExtraArgs: ['-ferror-limit=0'],
      backupBeforeOverwrite: true,
    },
  };
}

/** Import an existing folder: supports mcu-forge.json, Makefile, CMakeLists.txt, or raw source folder */
export function importProjectDirectory(
  projectDir: string,
  env?: EnvironmentReport
): { config: McuProjectConfig; importSource: string } {
  const normDir = path.resolve(projectDir);
  const folderName = path.basename(normDir);

  // 1. Check existing mcu-forge.json
  const forgeJsonPath = path.join(normDir, MCU_FORGE_CONFIG_FILE);
  if (fs.existsSync(forgeJsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(forgeJsonPath, 'utf8')) as McuProjectConfig;
      parsed.projectDir = toPosixPath(normDir);
      return { config: parsed, importSource: 'mcu-forge.json' };
    } catch {
      // Fall through to Makefile/CMake parsing
    }
  }

  // 2. Check Makefile
  const makefilePath = path.join(normDir, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    const content = fs.readFileSync(makefilePath, 'utf8');
    const vars = parseMakefileVariables(content);
    const config = buildConfigFromMakefile(normDir, folderName, vars, env);
    return { config, importSource: 'Makefile' };
  }

  // 3. Check CMakeLists.txt
  const cmakePath = path.join(normDir, 'CMakeLists.txt');
  if (fs.existsSync(cmakePath)) {
    const content = fs.readFileSync(cmakePath, 'utf8');
    const config = buildConfigFromCMake(normDir, folderName, content, env);
    return { config, importSource: 'CMakeLists.txt' };
  }

  // 4. Raw directory scan fallback
  const scan = scanDirectory(normDir);
  const isMcu = scan.linkerScripts.length > 0 || scan.asmSources.length > 0;
  const config = createBaseConfig(normDir, folderName, isMcu ? 'arm-generic' : 'generic-c', 'makefile', env);
  config.sourceGroups = groupSourcesByFolder([...scan.cSources, ...scan.cppSources]);
  config.asmSources = scan.asmSources;
  config.includeDirs = scan.includeDirs;
  config.linkerScript = scan.linkerScripts[0] || '';
  config.debugger.svdFile = scan.svdFiles[0] || '';
  return { config, importSource: '目录自动扫描' };
}

function buildConfigFromMakefile(
  projectDir: string,
  folderName: string,
  vars: Record<string, string>,
  env?: EnvironmentReport
): McuProjectConfig {
  const cDefsRaw = splitTokens(vars['C_DEFS']);
  const defines = cDefsRaw.map((d) => d.replace(/^-D/, '')).filter(Boolean);

  const isStm32 =
    defines.some((d) => d.toUpperCase().includes('STM32') || d === 'USE_HAL_DRIVER') ||
    (vars['OPENOCD_TARGET'] || '').toLowerCase().includes('stm32') ||
    (vars['LDSCRIPT'] || '').toUpperCase().includes('STM32');

  const isArm =
    isStm32 ||
    (vars['PREFIX'] || '').includes('arm-none-eabi') ||
    (vars['CPU'] || '').includes('cortex');

  const isRiscv =
    (vars['PREFIX'] || '').includes('riscv') || (vars['CPU'] || '').includes('rv32');

  const kind: ProjectKind = isStm32 ? 'stm32' : isArm ? 'arm-generic' : isRiscv ? 'riscv' : 'generic-c';
  const config = createBaseConfig(projectDir, vars['TARGET'] || folderName, kind, 'makefile', env);

  if (vars['BUILD_DIR']) config.buildDir = vars['BUILD_DIR'].trim();
  if (defines.length > 0) config.defines = defines;

  // Include dirs
  const incTokens = splitTokens(vars['C_INCLUDES']);
  const includes = incTokens
    .filter((t) => t.startsWith('-I'))
    .map((t) => toPosixPath(t.slice(2).replace(/^["']|["']$/g, '')))
    .filter(Boolean);
  config.includeDirs = Array.from(new Set(includes));

  // Sources
  const cSources = splitTokens(vars['C_SOURCES']).map((s) => toPosixPath(s));
  const cppSources = splitTokens(vars['CPP_SOURCES'] || vars['CXX_SOURCES']).map((s) => toPosixPath(s));
  const allSources = Array.from(new Set([...cSources, ...cppSources]));
  config.sourceGroups = groupSourcesByFolder(allSources);

  // ASM Sources
  const asmSources = splitTokens(vars['ASM_SOURCES'] || vars['ASMM_SOURCES']).map((s) => toPosixPath(s));
  config.asmSources = Array.from(new Set(asmSources));

  // Linker script
  if (vars['LDSCRIPT']) {
    config.linkerScript = toPosixPath(vars['LDSCRIPT'].trim());
  }

  // CPU / FPU / FLOAT-ABI (handle both CubeMX style and consolidated CPU style)
  const cpuParts: string[] = [];
  if (vars['CPU']) cpuParts.push(vars['CPU']);
  if (vars['FPU'] && !vars['CPU']?.includes('-mfpu')) cpuParts.push(vars['FPU']);
  if (vars['FLOAT-ABI'] && !vars['CPU']?.includes('-mfloat-abi')) cpuParts.push(vars['FLOAT-ABI']);
  if (cpuParts.length > 0) {
    let cpuJoined = cpuParts.join(' ');
    if (isArm && !cpuJoined.includes('-mthumb')) cpuJoined += ' -mthumb';
    config.flags.cpuFlags = cpuJoined.trim();
  }

  // Parse optimization & standard from CFLAGS / OPT
  const cflagsAll = `${vars['OPT'] || ''} ${vars['CFLAGS'] || ''}`;
  const optMatch = cflagsAll.match(/-(O[0123sg])\b/);
  if (optMatch) {
    config.flags.optimization = `-${optMatch[1]}` as OptimizationLevel;
  }
  const stdMatch = cflagsAll.match(/-std=([a-zA-Z0-9+]+)/);
  if (stdMatch) {
    config.flags.cStandard = stdMatch[1];
  }

  // GCC_PATH & PREFIX
  if (vars['GCC_PATH']) {
    config.toolchain.compilerDir = toPosixPath(vars['GCC_PATH'].trim().replace(/^["']|["']$/g, ''));
  }
  if (vars['PREFIX']) {
    const cleanPrefix = vars['PREFIX'].replace(/\$\(GCC_PATH\)/g, '').trim();
    if (cleanPrefix) config.toolchain.prefix = cleanPrefix;
  }

  // OpenOCD variables if present
  if (vars['OPENOCD']) {
    config.debugger.type = 'openocd';
    config.debugger.serverPath = toPosixPath(vars['OPENOCD'].trim().replace(/^["']|["']$/g, ''));
  }
  if (vars['OPENOCD_SCRIPTS']) {
    config.debugger.openocdScriptsDir = toPosixPath(vars['OPENOCD_SCRIPTS'].trim().replace(/^["']|["']$/g, ''));
  }
  if (vars['OPENOCD_INTERFACE']) {
    config.debugger.openocdInterface = vars['OPENOCD_INTERFACE'].trim().replace(/^["']|["']$/g, '');
  }
  if (vars['OPENOCD_TARGET']) {
    config.debugger.openocdTarget = vars['OPENOCD_TARGET'].trim().replace(/^["']|["']$/g, '');
  }
  if (vars['LIBS']) {
    config.flags.libs = vars['LIBS'].trim();
  }
  if (vars['JOBS']) {
    const parsedJobs = parseInt(vars['JOBS'], 10);
    if (!Number.isNaN(parsedJobs) && parsedJobs > 0) config.flags.parallelJobs = parsedJobs;
  }

  // Auto-detect SVD file in project if not set
  const scan = scanDirectory(projectDir, projectDir, config.excludedDirs);
  if (!config.debugger.svdFile && scan.svdFiles.length > 0) {
    config.debugger.svdFile = scan.svdFiles[0];
  }
  if (!config.linkerScript && scan.linkerScripts.length > 0) {
    config.linkerScript = scan.linkerScripts[0];
  }
  if (config.linkerScript) {
    const ldFull = path.resolve(projectDir, config.linkerScript);
    const parsedMem = parseLinkerMemoryLayout(ldFull);
    if (parsedMem) config.memoryLayout = parsedMem;
  }

  return config;
}

function buildConfigFromCMake(
  projectDir: string,
  folderName: string,
  content: string,
  env?: EnvironmentReport
): McuProjectConfig {
  const projMatch = content.match(/project\s*\(\s*([A-Za-z0-9_.-]+)/i);
  const name = projMatch ? projMatch[1] : folderName;
  const isStm32 = /STM32|USE_HAL_DRIVER/i.test(content);
  const isArm = isStm32 || /cortex-m|arm-none-eabi/i.test(content);
  const kind: ProjectKind = isStm32 ? 'stm32' : isArm ? 'arm-generic' : 'generic-c';

  const config = createBaseConfig(projectDir, name, kind, 'cmake', env);
  const scan = scanDirectory(projectDir, projectDir, config.excludedDirs);
  config.sourceGroups = groupSourcesByFolder([...scan.cSources, ...scan.cppSources]);
  config.asmSources = scan.asmSources;
  config.includeDirs = scan.includeDirs;
  config.linkerScript = scan.linkerScripts[0] || '';
  config.debugger.svdFile = scan.svdFiles[0] || '';

  // Extract compile definitions if present
  const defMatches = content.matchAll(/-D([A-Za-z0-9_=]+)/g);
  const defs = new Set<string>(config.defines);
  for (const m of defMatches) {
    if (m[1]) defs.add(m[1]);
  }
  config.defines = Array.from(defs);

  return config;
}

export interface NewProjectOptions {
  parentDir: string;
  name: string;
  projectKind: ProjectKind;
  buildSystem: BuildSystem;
  cpuFlags?: string;
  debuggerType?: McuProjectConfig['debugger']['type'];
  createStarterFiles: boolean;
}

/** Create a brand new MCU or pure C/C++ project (all hardware fields optional) */
export function createNewProject(
  options: NewProjectOptions,
  env?: EnvironmentReport
): McuProjectConfig {
  const projectDir = path.join(path.resolve(options.parentDir), options.name);
  fs.mkdirSync(projectDir, { recursive: true });

  const config = createBaseConfig(
    projectDir,
    options.name,
    options.projectKind,
    options.buildSystem,
    env
  );

  if (options.cpuFlags !== undefined) {
    config.flags.cpuFlags = options.cpuFlags;
  }
  if (options.debuggerType) {
    config.debugger.type = options.debuggerType;
  }

  if (options.createStarterFiles) {
    const srcDir = path.join(projectDir, 'src');
    const incDir = path.join(projectDir, 'inc');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(incDir, { recursive: true });

    const headerPath = path.join(incDir, 'app.h');
    const mainPath = path.join(srcDir, 'main.c');

    if (!fs.existsSync(headerPath)) {
      fs.writeFileSync(
        headerPath,
        `#ifndef APP_H\n#define APP_H\n\n#include <stdint.h>\n\nvoid app_init(void);\nvoid app_loop(void);\n\n#endif /* APP_H */\n`,
        'utf8'
      );
    }

    if (!fs.existsSync(mainPath)) {
      const mainCode =
        options.projectKind === 'generic-c'
          ? `#include <stdio.h>\n#include "app.h"\n\nvoid app_init(void) {\n    printf("Hello from ${options.name}!\\n");\n}\n\nvoid app_loop(void) {\n}\n\nint main(void) {\n    app_init();\n    app_loop();\n    return 0;\n}\n`
          : `#include "app.h"\n\nstatic volatile uint32_t g_tick = 0;\n\nvoid app_init(void) {\n    g_tick = 0;\n}\n\nvoid app_loop(void) {\n    g_tick++;\n}\n\nint main(void) {\n    app_init();\n    while (1) {\n        app_loop();\n    }\n    return 0;\n}\n`;
      fs.writeFileSync(mainPath, mainCode, 'utf8');
    }

    config.includeDirs = ['inc'];
    config.sourceGroups = [
      {
        id: 'grp-1-src',
        name: 'src',
        files: ['src/main.c'],
      },
    ];
  }

  return config;
}

const SUB_PROJECT_SKIP_DIRS = new Set([
  ...DEFAULT_EXCLUDED_DIRS.map((d) => d.toLowerCase()),
  'drivers',
  'middlewares',
  'core',
  'inc',
  'src',
  'docs',
  'datasheet',
  'tools',
  'cmsis',
  'usb_device',
  'device',
]);

/** Discover independent Makefile / CMakeLists.txt / mcu-forge.json program folders inside a workspace */
function discoverSubProgramDirs(rootDir: string, maxDepth = 2): string[] {
  const results: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SUB_PROJECT_SKIP_DIRS.has(e.name.toLowerCase()) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      const hasProjectFile =
        fs.existsSync(path.join(full, MCU_FORGE_CONFIG_FILE)) ||
        fs.existsSync(path.join(full, 'Makefile')) ||
        fs.existsSync(path.join(full, 'CMakeLists.txt'));
      if (hasProjectFile) {
        results.push(full);
      } else {
        walk(full, depth + 1);
      }
    }
  }

  walk(rootDir, 1);
  return results;
}

/** Import a workspace folder that may contain 1 or multiple MCU programs (e.g. IAP Bootloader + App) */
export function importWorkspaceDirectory(dirPath: string, env?: EnvironmentReport): WorkspaceState {
  const normRoot = path.resolve(dirPath);
  const wsMetaPath = path.join(normRoot, MCU_FORGE_WORKSPACE_FILE);

  // 1. Restore from mcu-forge-workspace.json if present
  if (fs.existsSync(wsMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(wsMetaPath, 'utf8')) as { programs?: string[] };
      const programs: McuProjectConfig[] = [];
      for (const rel of meta.programs || []) {
        const abs = path.resolve(normRoot, rel);
        if (fs.existsSync(abs)) {
          programs.push(importProjectDirectory(abs, env).config);
        }
      }
      if (programs.length > 0) {
        return {
          workspaceDir: toPosixPath(normRoot),
          programs,
          activeIndex: 0,
          importSummary: `从工作区配置恢复 ${programs.length} 个程序`,
        };
      }
    } catch {
      // Fall through to auto discovery
    }
  }

  const rootHasBuildFile =
    fs.existsSync(path.join(normRoot, MCU_FORGE_CONFIG_FILE)) ||
    fs.existsSync(path.join(normRoot, 'Makefile')) ||
    fs.existsSync(path.join(normRoot, 'CMakeLists.txt'));

  const subDirs = discoverSubProgramDirs(normRoot, 2);
  const programs: McuProjectConfig[] = [];
  const sources: string[] = [];

  if (rootHasBuildFile) {
    const res = importProjectDirectory(normRoot, env);
    programs.push(res.config);
    sources.push(`${res.config.name}(${res.importSource})`);
  }

  for (const sub of subDirs) {
    const res = importProjectDirectory(sub, env);
    programs.push(res.config);
    sources.push(`${res.config.name}(${res.importSource})`);
  }

  // Fallback: single raw directory scan
  if (programs.length === 0) {
    const res = importProjectDirectory(normRoot, env);
    programs.push(res.config);
    sources.push(`${res.config.name}(${res.importSource})`);
  }

  return {
    workspaceDir: toPosixPath(normRoot),
    programs,
    activeIndex: 0,
    importSummary:
      programs.length > 1
        ? `自动发现 ${programs.length} 个独立程序: ${sources.join(', ')}`
        : `导入成功: ${sources[0]}`,
  };
}

export function saveWorkspaceMeta(workspaceDir: string, programDirs: string[]): void {
  const normRoot = path.resolve(workspaceDir);
  const rels = programDirs.map((d) => {
    const r = toRelativePosix(normRoot, path.resolve(d));
    return r === '' ? '.' : r;
  });
  const metaPath = path.join(normRoot, MCU_FORGE_WORKSPACE_FILE);
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ schemaVersion: 1, programs: Array.from(new Set(rels)) }, null, 2) + '\n',
    'utf8'
  );
}

/** Generate a minimal GNU linker script when user specifies a custom Flash origin for a new segment */
function createStarterLinkerScript(
  projectDir: string,
  name: string,
  flashOrigin: string,
  flashLength: string
): string {
  const ldName = `${name}.ld`;
  const ldPath = path.join(projectDir, ldName);
  if (!fs.existsSync(ldPath)) {
    const origin = flashOrigin.trim() || '0x08000000';
    const length = flashLength.trim() || '256K';
    fs.writeFileSync(
      ldPath,
      `/* Generated by MCU Forge Studio — Starter Linker Script */\nENTRY(Reset_Handler)\n\nMEMORY\n{\n  FLASH (rx)  : ORIGIN = ${origin}, LENGTH = ${length}\n  RAM (xrw)   : ORIGIN = 0x20000000, LENGTH = 64K\n}\n\nSECTIONS\n{\n  .text : { *(.isr_vector) *(.text*) *(.rodata*) } > FLASH\n  .data : { *(.data*) } > RAM AT > FLASH\n  .bss  : { *(.bss*) *(COMMON) } > RAM\n}\n`,
      'utf8'
    );
  }
  return ldName;
}

/** Create one program segment inside a workspace */
export function createProgramSegment(
  workspaceDir: string,
  opts: {
    projectKind: ProjectKind;
    buildSystem: BuildSystem;
    cpuFlags?: string;
    debuggerType?: McuProjectConfig['debugger']['type'];
    createStarterFiles: boolean;
    segment: NewProgramSegment;
  },
  env?: EnvironmentReport
): McuProjectConfig {
  const seg = opts.segment;
  const targetDir = seg.subDir.trim()
    ? path.join(path.resolve(workspaceDir), seg.subDir.trim())
    : path.resolve(workspaceDir);

  fs.mkdirSync(targetDir, { recursive: true });

  const config = createBaseConfig(
    targetDir,
    seg.name.trim() || path.basename(targetDir),
    opts.projectKind,
    opts.buildSystem,
    env
  );

  if (opts.cpuFlags !== undefined) config.flags.cpuFlags = opts.cpuFlags;
  if (opts.debuggerType) config.debugger.type = opts.debuggerType;

  if (seg.flashOrigin.trim() || seg.flashLength.trim()) {
    config.memoryLayout = {
      flashOrigin: seg.flashOrigin.trim() || '0x08000000',
      flashLength: seg.flashLength.trim() || '',
      ramOrigin: '0x20000000',
      ramLength: '64K',
    };
    if (opts.projectKind !== 'generic-c' && seg.flashOrigin.trim()) {
      config.linkerScript = createStarterLinkerScript(
        targetDir,
        config.name,
        seg.flashOrigin,
        seg.flashLength
      );
    }
  }

  if (opts.createStarterFiles) {
    const srcDir = path.join(targetDir, 'src');
    const incDir = path.join(targetDir, 'inc');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(incDir, { recursive: true });

    const headerPath = path.join(incDir, 'app.h');
    const mainPath = path.join(srcDir, 'main.c');
    if (!fs.existsSync(headerPath)) {
      fs.writeFileSync(
        headerPath,
        `#ifndef APP_H\n#define APP_H\n\n#include <stdint.h>\n\nvoid app_init(void);\nvoid app_loop(void);\n\n#endif /* APP_H */\n`,
        'utf8'
      );
    }
    if (!fs.existsSync(mainPath)) {
      const originComment = seg.flashOrigin.trim()
        ? `/* Flash Origin: ${seg.flashOrigin.trim()}${seg.flashLength ? ` (${seg.flashLength})` : ''} */\n`
        : '';
      const mainCode =
        opts.projectKind === 'generic-c'
          ? `#include <stdio.h>\n#include "app.h"\n\nvoid app_init(void) {\n    printf("Hello from ${config.name}!\\n");\n}\n\nvoid app_loop(void) {}\n\nint main(void) {\n    app_init();\n    app_loop();\n    return 0;\n}\n`
          : `${originComment}#include "app.h"\n\nstatic volatile uint32_t g_tick = 0;\n\nvoid app_init(void) {\n    g_tick = 0;\n}\n\nvoid app_loop(void) {\n    g_tick++;\n}\n\nint main(void) {\n    app_init();\n    while (1) {\n        app_loop();\n    }\n    return 0;\n}\n`;
      fs.writeFileSync(mainPath, mainCode, 'utf8');
    }

    config.includeDirs = ['inc'];
    config.sourceGroups = [
      { id: 'grp-1-src', name: 'src', files: ['src/main.c'] },
    ];
  }

  return config;
}

/** Create a brand new workspace with 1 or multiple program segments (e.g. IAP Bootloader + App) */
export function createNewWorkspace(
  options: NewWorkspaceOptions,
  env?: EnvironmentReport
): WorkspaceState {
  const wsDir = path.join(path.resolve(options.parentDir), options.workspaceName.trim());
  fs.mkdirSync(wsDir, { recursive: true });

  const segments: NewProgramSegment[] =
    options.segments.length > 0
      ? options.segments
      : [{ name: options.workspaceName.trim(), subDir: '', flashOrigin: '', flashLength: '' }];

  const isMulti = segments.length > 1;
  const programs = segments.map((seg, idx) => {
    const effectiveSubDir = isMulti ? seg.subDir.trim() || seg.name.trim() || `prog_${idx + 1}` : '';
    return createProgramSegment(
      wsDir,
      {
        projectKind: options.projectKind,
        buildSystem: options.buildSystem,
        cpuFlags: options.cpuFlags,
        debuggerType: options.debuggerType,
        createStarterFiles: options.createStarterFiles,
        segment: { ...seg, subDir: effectiveSubDir },
      },
      env
    );
  });

  if (isMulti) {
    saveWorkspaceMeta(
      wsDir,
      programs.map((p) => p.projectDir)
    );
  }

  return {
    workspaceDir: toPosixPath(wsDir),
    programs,
    activeIndex: 0,
    importSummary: `已新建工程 "${options.workspaceName}"（包含 ${programs.length} 个程序段）`,
  };
}
