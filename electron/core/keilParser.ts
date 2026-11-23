import * as fs from 'fs';
import * as path from 'path';
import { EnvironmentReport, McuProjectConfig, SourceGroup, WorkspaceState } from './types';
import { DEFAULT_EXCLUDED_DIRS, scanDirectory } from './scanner';
import { toPosixPath, toRelativePosix } from './platform';
import { parseLinkerMemoryLayout } from './parser';

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function inferCpuFlagsFromDevice(device: string, cpuAttr: string): string {
  const dev = device.toUpperCase();
  const cpu = cpuAttr.toUpperCase();
  if (dev.includes('STM32F0') || dev.includes('STM32G0') || dev.includes('STM32L0') || cpu.includes('CORTEX-M0')) {
    return '-mcpu=cortex-m0 -mthumb -mfloat-abi=soft';
  }
  if (dev.includes('STM32F1') || dev.includes('STM32F2') || dev.includes('STM32L1') || dev.includes('GD32F1') || cpu.includes('CORTEX-M3')) {
    return '-mcpu=cortex-m3 -mthumb -mfloat-abi=soft';
  }
  if (dev.includes('STM32F4') || dev.includes('STM32F3') || dev.includes('STM32G4') || dev.includes('STM32L4') || dev.includes('GD32F4') || dev.includes('AT32F4') || cpu.includes('CORTEX-M4')) {
    return '-mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard';
  }
  if (dev.includes('STM32F7') || dev.includes('STM32H7') || cpu.includes('CORTEX-M7')) {
    return '-mcpu=cortex-m7 -mthumb -mfpu=fpv5-d16 -mfloat-abi=hard';
  }
  if (dev.includes('STM32U5') || dev.includes('STM32H5') || cpu.includes('CORTEX-M33')) {
    return '-mcpu=cortex-m33 -mthumb -mfpu=fpv5-sp-d16 -mfloat-abi=hard';
  }
  return '-mcpu=cortex-m3 -mthumb -mfloat-abi=soft';
}

function inferOpenocdTarget(device: string): string {
  const dev = device.toUpperCase();
  if (dev.startsWith('STM32F1')) return 'target/stm32f1x.cfg';
  if (dev.startsWith('STM32F4')) return 'target/stm32f4x.cfg';
  if (dev.startsWith('STM32F0')) return 'target/stm32f0x.cfg';
  if (dev.startsWith('STM32F3')) return 'target/stm32f3x.cfg';
  if (dev.startsWith('STM32F7')) return 'target/stm32f7x.cfg';
  if (dev.startsWith('STM32G0')) return 'target/stm32g0x.cfg';
  if (dev.startsWith('STM32G4')) return 'target/stm32g4x.cfg';
  if (dev.startsWith('STM32H7')) return 'target/stm32h7x.cfg';
  if (dev.startsWith('STM32L4')) return 'target/stm32l4x.cfg';
  return 'target/stm32f1x.cfg';
}

function parseCpuMemory(cpuAttr: string): { flashOrigin: string; flashLength: string; ramOrigin: string; ramLength: string } | undefined {
  // Example: IROM(0x08000000,0x00080000) IRAM(0x20000000,0x00010000)
  const irom = cpuAttr.match(/IROM\(\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+)\s*\)/i);
  const iram = cpuAttr.match(/IRAM\(\s*(0x[0-9a-fA-F]+)\s*,\s*(0x[0-9a-fA-F]+)\s*\)/i);
  if (!irom && !iram) return undefined;
  const formatSize = (hexStr?: string) => {
    if (!hexStr) return '';
    const bytes = parseInt(hexStr, 16);
    if (Number.isNaN(bytes) || bytes <= 0) return '';
    return bytes % 1024 === 0 ? `${bytes / 1024}K` : `${bytes}`;
  };
  return {
    flashOrigin: irom?.[1] || '0x08000000',
    flashLength: formatSize(irom?.[2]),
    ramOrigin: iram?.[1] || '0x20000000',
    ramLength: formatSize(iram?.[2]),
  };
}

/**
 * Parse a Keil MDK .uvprojx file into a cross-platform WorkspaceState (supports multi-target uvprojx).
 * If the .uvprojx lives inside MDK-ARM/, projectDir automatically resolves to the parent project root.
 */
export function importKeilUvprojx(uvprojxPath: string, env?: EnvironmentReport): WorkspaceState {
  const absUvprojx = path.resolve(uvprojxPath);
  const uvDir = path.dirname(absUvprojx);
  const parentName = path.basename(uvDir).toLowerCase();
  const projectRoot = parentName === 'mdk-arm' || parentName === 'keil' ? path.dirname(uvDir) : uvDir;

  const xml = fs.readFileSync(absUvprojx, 'utf8');
  const targetBlocks = extractAllBlocks(xml, 'Target');
  if (targetBlocks.length === 0) {
    throw new Error('未在 .uvprojx 文件中找到有效的 <Target> 节点');
  }

  const armGcc = env?.tools.find((t) => t.prefix === 'arm-none-eabi-');
  const makeTool = env?.tools.find((t) => t.name.startsWith('GNU Make') || t.name.startsWith('MinGW Make'));
  const cmakeTool = env?.tools.find((t) => t.name.startsWith('CMake'));
  const openocdTool = env?.tools.find((t) => t.name === 'OpenOCD');
  let openocdScriptsDir = '';
  if (openocdTool?.path) {
    const candidate = path.resolve(path.dirname(openocdTool.path), '..', 'share', 'openocd', 'scripts');
    if (fs.existsSync(candidate)) openocdScriptsDir = toPosixPath(candidate);
  }

  // Scan project root once for GCC linker scripts & GCC startup files
  const rootScan = scanDirectory(projectRoot, projectRoot, DEFAULT_EXCLUDED_DIRS);
  const findMatchingGccStartup = (keilStartupRel: string): string | undefined => {
    const baseName = path.basename(keilStartupRel).toLowerCase();
    // 1. Exact filename match inside a gcc/ folder (e.g. startup_stm32f103xe.s)
    const exact = rootScan.asmSources.find(
      (s) =>
        path.basename(s).toLowerCase() === baseName &&
        s.toLowerCase().includes('/gcc/')
    );
    if (exact) return exact;
    // 2. Device/Templates/gcc startup match (excluding DSP_Lib_TestSuite)
    return rootScan.asmSources.find(
      (s) =>
        s.toLowerCase().includes('/gcc/') &&
        s.toLowerCase().includes('startup') &&
        !s.toLowerCase().includes('testsuite')
    );
  };

  const programs: McuProjectConfig[] = targetBlocks.map((tXml, idx) => {
    const targetName = extractTag(tXml, 'TargetName') || path.basename(absUvprojx, '.uvprojx') || `target_${idx + 1}`;
    const device = extractTag(tXml, 'Device');
    const cpuAttr = extractTag(tXml, 'Cpu');

    // Parse Cads -> VariousControls
    const cadsXml = extractTag(tXml, 'Cads');
    const variousXml = extractTag(cadsXml, 'VariousControls') || cadsXml;
    const rawDefines = extractTag(variousXml, 'Define');
    const rawIncludes = extractTag(variousXml, 'IncludePath');

    const defines = rawDefines
      .split(/[,;\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);

    const includeDirs = Array.from(
      new Set(
        rawIncludes
          .split(';')
          .map((inc) => inc.trim())
          .filter(Boolean)
          .map((inc) => {
            const absInc = path.resolve(uvDir, inc);
            return toRelativePosix(projectRoot, absInc);
          })
      )
    );

    // Parse Groups & Files
    const groupBlocks = extractAllBlocks(tXml, 'Group');
    const sourceGroups: SourceGroup[] = [];
    const asmSources: string[] = [];
    const staticLibs: string[] = [];
    const disabledFiles: string[] = [];

    groupBlocks.forEach((gXml, gIdx) => {
      const gName = extractTag(gXml, 'GroupName') || `Group_${gIdx + 1}`;
      const fileBlocks = extractAllBlocks(gXml, 'File');
      const groupCFiles: string[] = [];

      for (const fXml of fileBlocks) {
        const rawPath = extractTag(fXml, 'FilePath');
        if (!rawPath) continue;
        const absFile = path.resolve(uvDir, rawPath);
        const relPosix = toRelativePosix(projectRoot, absFile);
        const ext = path.extname(relPosix).toLowerCase();

        const includeInBuild = extractTag(fXml, 'IncludeInBuild');
        const isDisabled = includeInBuild === '0';

        if (ext === '.c' || ext === '.cpp' || ext === '.cc' || ext === '.cxx') {
          groupCFiles.push(relPosix);
          if (isDisabled) disabledFiles.push(relPosix);
        } else if (ext === '.s' || ext === '.asm') {
          // Prefer GCC startup file over ARMCC MDK startup if found in project
          const gccMatch = relPosix.toLowerCase().includes('startup') ? findMatchingGccStartup(relPosix) : undefined;
          if (gccMatch) {
            if (!asmSources.includes(gccMatch)) asmSources.push(gccMatch);
          } else {
            asmSources.push(relPosix);
          }
        } else if (ext === '.a' || ext === '.lib') {
          staticLibs.push(relPosix);
        }
      }

      if (groupCFiles.length > 0) {
        sourceGroups.push({
          id: `keil-grp-${gIdx + 1}-${gName.replace(/[^a-zA-Z0-9]/g, '_')}`,
          name: gName,
          files: Array.from(new Set(groupCFiles)),
        });
      }
    });

    const isStm32 = device.toUpperCase().includes('STM32') || defines.some((d) => d.toUpperCase().includes('STM32'));
    const linkerScript = rootScan.linkerScripts[0] || '';
    const parsedMem =
      (linkerScript ? parseLinkerMemoryLayout(path.resolve(projectRoot, linkerScript)) : undefined) ||
      parseCpuMemory(cpuAttr);

    return {
      schemaVersion: 1,
      projectDir: toPosixPath(projectRoot),
      name: targetName,
      projectKind: isStm32 ? 'stm32' : 'arm-generic',
      buildSystem: 'makefile',
      buildDir: 'build',
      linkerScript,
      memoryLayout: parsedMem,
      useLocalMk: false,
      defines,
      includeDirs,
      sourceGroups,
      disabledFiles,
      staticLibs,
      libSearchDirs: [],
      asmSources: Array.from(new Set(asmSources)),
      excludedDirs: [...DEFAULT_EXCLUDED_DIRS],
      hooks: { preBuild: '', postBuild: '' },
      toolchain: {
        compilerDir: armGcc?.dir || '',
        prefix: 'arm-none-eabi-',
        ccExecutable: '',
        cxxExecutable: '',
        asExecutable: '',
        ldExecutable: '',
        objcopyExecutable: '',
        sizeExecutable: '',
        gdbExecutable: '',
        makeExecutable: makeTool?.path || 'make',
        cmakeExecutable: cmakeTool?.path || 'cmake',
        ninjaExecutable: '',
        sysIncludeDir: '',
      },
      debugger: {
        type: openocdTool ? 'openocd' : 'none',
        serverPath: openocdTool?.path || '',
        openocdScriptsDir,
        openocdInterface: 'interface/stlink.cfg',
        openocdTarget: inferOpenocdTarget(device),
        deviceName: device,
        interfaceMode: 'swd',
        svdFile: rootScan.svdFiles[0] || '',
        customFlashCommand: '',
        customDebugArgs: '',
      },
      flags: {
        cpuFlags: inferCpuFlagsFromDevice(device, cpuAttr),
        cStandard: 'gnu11',
        cxxStandard: 'gnu++17',
        optimization: '-O2',
        debugInfo: '-g3',
        warnings: '-Wall',
        extraCFlags: '-ffunction-sections -fdata-sections -fno-strict-aliasing',
        extraAsFlags: '',
        extraLdFlags: '--specs=nano.specs -Wl,--gc-sections -Wl,--no-warn-rwx-segments',
        libs: '-Wl,--start-group -lc -lm -Wl,--end-group -u _printf_float',
        parallelJobs: 8,
        generateHex: true,
        generateBin: true,
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
  });

  return {
    workspaceDir: toPosixPath(projectRoot),
    programs,
    activeIndex: 0,
    importSummary: `从 Keil 工程 (${path.basename(absUvprojx)}) 导入 ${programs.length} 个 Target`,
  };
}
