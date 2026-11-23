import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { DetectedTool, EnvironmentReport, HostPlatform } from './types';
import { exeName, getHomeDir, getHostPlatform, toPosixPath } from './platform';

function existsFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function getVersionSafe(binPath: string, args: string[] = ['--version']): string | undefined {
  try {
    const out = execFileSync(binPath, args, {
      timeout: 2500,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    const firstLine = (out || '').split(/\r?\n/).find((l) => l.trim().length > 0);
    return firstLine?.trim().slice(0, 80);
  } catch {
    return undefined;
  }
}

function findInPath(executable: string, platform: HostPlatform): string[] {
  const pathEnv = process.env.PATH || '';
  const sep = platform === 'win32' ? ';' : ':';
  const name = exeName(executable, platform);
  const found: string[] = [];
  for (const dir of pathEnv.split(sep)) {
    if (!dir.trim()) continue;
    const candidate = path.join(dir.trim(), name);
    if (existsFile(candidate)) {
      found.push(candidate);
    }
  }
  return found;
}

/** Scan known cross-platform directories where MCU toolchains commonly live */
function getExtraSearchDirs(platform: HostPlatform): string[] {
  const home = getHomeDir();
  const dirs: string[] = [];

  if (platform === 'win32') {
    dirs.push(
      'C:/Program Files/CMake/bin',
      'C:/Program Files (x86)/Arm GNU Toolchain arm-none-eabi',
      'C:/Program Files/Arm GNU Toolchain arm-none-eabi',
      'C:/msys64/mingw64/bin',
      'C:/msys64/usr/bin',
      'D:/msys64/mingw64/bin',
      'E:/msys64/mingw64/bin',
      'C:/Program Files/SEGGER/JLink',
      'C:/Program Files/SEGGER/JLink_V794',
      'C:/Program Files/LLVM/bin',
      path.join(home, 'AppData/Local/Programs/Microsoft VS Code/bin'),
      path.join(home, 'STM32Cube/Repository/Packs/STMicroelectronics'),
    );

    // Scan top-level C:/ D:/ E:/ for OpenOCD* or arm-gnu-toolchain* or gcc-arm*
    for (const drive of ['C:/', 'D:/', 'E:/']) {
      try {
        if (!fs.existsSync(drive)) continue;
        const entries = fs.readdirSync(drive, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          const lower = e.name.toLowerCase();
          if (
            lower.includes('openocd') ||
            lower.includes('arm-gnu') ||
            lower.includes('gcc-arm') ||
            lower.includes('jlink') ||
            lower.includes('stlink') ||
            lower.includes('riscv') ||
            lower.includes('xpack')
          ) {
            dirs.push(path.join(drive, e.name, 'bin'));
            dirs.push(path.join(drive, e.name));
          }
        }
      } catch {
        // ignore permission errors
      }
    }

    // Look inside STM32Cube Packs for gnu-tools-for-stm32
    const cubePacks = path.join(home, 'STM32Cube/Repository/Packs/STMicroelectronics');
    collectNestedBinDirs(cubePacks, 7, dirs);
  } else if (platform === 'darwin') {
    dirs.push(
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/Applications/ARM/bin',
      '/Applications/STM32CubeIDE.app/Contents/Eclipse/plugins',
      '/Applications/SEGGER/JLink',
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin',
      path.join(home, '.local/bin'),
      path.join(home, 'STM32Cube/Repository/Packs/STMicroelectronics'),
    );
  } else {
    dirs.push(
      '/usr/bin',
      '/usr/local/bin',
      '/opt/arm-gnu-toolchain/bin',
      '/opt/SEGGER/JLink',
      '/opt/openocd/bin',
      path.join(home, '.local/bin'),
      path.join(home, 'STM32Cube/Repository/Packs/STMicroelectronics'),
    );
  }

  return Array.from(new Set(dirs.map((d) => path.normalize(d))));
}

function collectNestedBinDirs(root: string, maxDepth: number, acc: string[]): void {
  if (maxDepth <= 0 || !fs.existsSync(root)) return;
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(root, e.name);
      if (e.name.toLowerCase() === 'bin') {
        acc.push(full);
      } else {
        collectNestedBinDirs(full, maxDepth - 1, acc);
      }
    }
  } catch {
    // ignore
  }
}

export function detectEnvironment(): EnvironmentReport {
  const platform = getHostPlatform();
  const extraDirs = getExtraSearchDirs(platform);
  const tools: DetectedTool[] = [];
  const seenPaths = new Set<string>();

  const targets: Array<{
    name: string;
    exe: string;
    category: DetectedTool['category'];
    prefix?: string;
    versionArgs?: string[];
  }> = [
    { name: 'ARM GCC (arm-none-eabi-gcc)', exe: 'arm-none-eabi-gcc', category: 'compiler', prefix: 'arm-none-eabi-' },
    { name: 'RISC-V GCC (riscv-none-elf-gcc)', exe: 'riscv-none-elf-gcc', category: 'compiler', prefix: 'riscv-none-elf-' },
    { name: 'RISC-V GCC (riscv64-unknown-elf-gcc)', exe: 'riscv64-unknown-elf-gcc', category: 'compiler', prefix: 'riscv64-unknown-elf-' },
    { name: 'Native GCC (gcc)', exe: 'gcc', category: 'compiler', prefix: '' },
    { name: 'Clang (clang)', exe: 'clang', category: 'compiler', prefix: '' },
    { name: 'GNU Make (make)', exe: 'make', category: 'build' },
    { name: 'MinGW Make (mingw32-make)', exe: 'mingw32-make', category: 'build' },
    { name: 'CMake (cmake)', exe: 'cmake', category: 'build' },
    { name: 'Ninja (ninja)', exe: 'ninja', category: 'build' },
    { name: 'OpenOCD', exe: 'openocd', category: 'debugger', versionArgs: ['--version'] },
    { name: 'J-Link GDB Server', exe: platform === 'win32' ? 'JLinkGDBServerCL' : 'JLinkGDBServer', category: 'debugger', versionArgs: ['-version'] },
    { name: 'ST-Link Flash (st-flash)', exe: 'st-flash', category: 'debugger' },
    { name: 'PyOCD', exe: 'pyocd', category: 'debugger' },
    { name: 'clangd LSP', exe: 'clangd', category: 'ide' },
    { name: 'VS Code CLI (code)', exe: platform === 'win32' ? 'code.cmd' : 'code', category: 'ide' },
  ];

  for (const t of targets) {
    const candidates = new Set<string>(findInPath(t.exe, platform));
    const targetFile = t.exe.includes('.') ? t.exe : exeName(t.exe, platform);
    for (const d of extraDirs) {
      const c = path.join(d, targetFile);
      if (existsFile(c)) candidates.add(c);
    }

    for (const found of candidates) {
      const norm = toPosixPath(found);
      if (seenPaths.has(norm.toLowerCase())) continue;
      seenPaths.add(norm.toLowerCase());
      tools.push({
        name: t.name,
        category: t.category,
        path: norm,
        dir: toPosixPath(path.dirname(found)),
        prefix: t.prefix,
        version: t.exe.endsWith('.cmd') ? undefined : getVersionSafe(found, t.versionArgs),
      });
    }
  }

  return {
    platform,
    arch: process.arch,
    tools,
  };
}
