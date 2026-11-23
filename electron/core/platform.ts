import * as path from 'path';
import * as os from 'os';
import { HostPlatform } from './types';

export function getHostPlatform(): HostPlatform {
  const p = process.platform;
  if (p === 'win32' || p === 'darwin') return p;
  return 'linux';
}

/** Normalize any filesystem path to POSIX forward slashes (for Makefile/CMake/clangd/JSON) */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Convert a path to relative POSIX path from projectDir */
export function toRelativePosix(projectDir: string, targetPath: string): string {
  const rel = path.relative(projectDir, targetPath);
  return toPosixPath(rel || '.');
}

/** Resolve an executable name with platform suffix (.exe on Windows) */
export function exeName(base: string, platform: HostPlatform = getHostPlatform()): string {
  if (platform === 'win32') {
    return base.toLowerCase().endsWith('.exe') ? base : `${base}.exe`;
  }
  return base.replace(/\.exe$/i, '');
}

/** Normalize directory with trailing slash for Makefile GCC_PATH */
export function withTrailingSlash(dir: string): string {
  if (!dir.trim()) return '';
  const posix = toPosixPath(dir.trim());
  return posix.endsWith('/') ? posix : `${posix}/`;
}

/** Get user home directory safely */
export function getHomeDir(): string {
  return os.homedir();
}

/** Quote shell path if it contains spaces */
export function quoteIfNeeded(p: string): string {
  if (!p) return p;
  return /\s/.test(p) ? `"${p}"` : p;
}
