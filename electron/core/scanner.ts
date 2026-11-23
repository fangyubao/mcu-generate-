import * as fs from 'fs';
import * as path from 'path';
import { ScanResult, SourceGroup } from './types';
import { toRelativePosix } from './platform';

export const DEFAULT_EXCLUDED_DIRS = [
  '.git',
  '.vscode',
  '.cache',
  '.idea',
  'build',
  'cmake-build-debug',
  'cmake-build-release',
  'Debug',
  'Release',
  'MDK-ARM',
  'EWARM',
  'node_modules',
  'dist',
];

const C_EXTS = new Set(['.c']);
const CPP_EXTS = new Set(['.cpp', '.cc', '.cxx']);
const ASM_EXTS = new Set(['.s', '.S', '.asm']);
const HEADER_EXTS = new Set(['.h', '.hpp', '.hh', '.hxx']);

export function scanDirectory(
  projectDir: string,
  targetDir: string = projectDir,
  excludedDirs: string[] = DEFAULT_EXCLUDED_DIRS
): ScanResult {
  const cSources: string[] = [];
  const cppSources: string[] = [];
  const asmSources: string[] = [];
  const includeDirSet = new Set<string>();
  const linkerScripts: string[] = [];
  const svdFiles: string[] = [];

  const excludeSet = new Set(excludedDirs.map((d) => d.toLowerCase().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')));

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPosix = toRelativePosix(projectDir, fullPath);

      if (entry.isDirectory()) {
        const nameLower = entry.name.toLowerCase();
        const relLower = relPosix.toLowerCase();
        if (excludeSet.has(nameLower) || excludeSet.has(relLower)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const extLower = ext.toLowerCase();
        if (C_EXTS.has(extLower)) {
          cSources.push(relPosix);
        } else if (CPP_EXTS.has(extLower)) {
          cppSources.push(relPosix);
        } else if (ASM_EXTS.has(ext)) {
          asmSources.push(relPosix);
        } else if (HEADER_EXTS.has(extLower)) {
          const parentRel = toRelativePosix(projectDir, currentDir);
          includeDirSet.add(parentRel === '' ? '.' : parentRel);
        } else if (extLower === '.ld' || extLower === '.lds') {
          linkerScripts.push(relPosix);
        } else if (extLower === '.svd') {
          svdFiles.push(relPosix);
        }
      }
    }
  }

  walk(targetDir);

  return {
    cSources: cSources.sort(),
    cppSources: cppSources.sort(),
    asmSources: asmSources.sort(),
    includeDirs: Array.from(includeDirSet).sort(),
    linkerScripts: linkerScripts.sort(),
    svdFiles: svdFiles.sort(),
  };
}

/** Group source files into Keil-like logical groups based on directory hierarchy */
export function groupSourcesByFolder(files: string[]): SourceGroup[] {
  const map = new Map<string, string[]>();
  for (const file of files) {
    const clean = file.replace(/\\/g, '/').replace(/^\.\//, '');
    const parts = clean.split('/');
    let groupName = 'Root';
    if (parts.length >= 3) {
      groupName = `${parts[0]}/${parts[1]}`;
    } else if (parts.length === 2) {
      groupName = parts[0];
    }
    if (!map.has(groupName)) {
      map.set(groupName, []);
    }
    map.get(groupName)!.push(clean);
  }

  const groups: SourceGroup[] = [];
  let idx = 1;
  for (const [name, list] of Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({
      id: `grp-${idx++}-${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name,
      files: Array.from(new Set(list)).sort(),
    });
  }
  return groups;
}
