import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  McuProjectConfig,
  MemoryAnalysisReport,
  MergeFirmwareResult,
  SymbolEntry,
} from './types';
import { exeName, getHostPlatform, toPosixPath, withTrailingSlash } from './platform';

function resolveTool(config: McuProjectConfig, baseName: string): string {
  const platform = getHostPlatform();
  const toolExe = exeName(`${config.toolchain.prefix}${baseName}`, platform);
  if (config.toolchain.compilerDir.trim()) {
    return `${withTrailingSlash(config.toolchain.compilerDir)}${toolExe}`;
  }
  return toolExe;
}

/**
 * Analyze ELF / Map file to extract Flash & RAM usage + Top symbol breakdown.
 */
export function analyzeElfMemory(config: McuProjectConfig): MemoryAnalysisReport {
  const isGenericC = config.projectKind === 'generic-c';
  const buildDir = path.resolve(config.projectDir, config.buildDir || 'build');
  const elfPath = path.join(buildDir, isGenericC ? config.name : `${config.name}.elf`);
  const mapPath = path.join(buildDir, `${config.name}.map`);

  if (!fs.existsSync(elfPath) && !fs.existsSync(mapPath)) {
    throw new Error(`未找到编译产物 ${toPosixPath(elfPath)}，请先执行一次编译。`);
  }

  let textBytes = 0;
  let dataBytes = 0;
  let bssBytes = 0;

  // 1. Try running `size` for exact totals
  if (fs.existsSync(elfPath)) {
    try {
      const sizeBin = config.toolchain.sizeExecutable.trim() || resolveTool(config, 'size');
      const sizeOut = execFileSync(sizeBin, [elfPath], { encoding: 'utf8', timeout: 5000 });
      for (const line of sizeOut.split(/\r?\n/)) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[0-9a-fA-F]+\s+.+/);
        if (m) {
          textBytes = parseInt(m[1], 10);
          dataBytes = parseInt(m[2], 10);
          bssBytes = parseInt(m[3], 10);
          break;
        }
      }
    } catch {
      // ignore, will sum from symbols if needed
    }
  }

  const flashSyms: SymbolEntry[] = [];
  const ramSyms: SymbolEntry[] = [];
  let source: 'nm' | 'map' = 'nm';

  // 2. Try `nm --print-size --size-sort --reverse-sort -C`
  if (fs.existsSync(elfPath)) {
    try {
      const nmBin = resolveTool(config, 'nm');
      const nmOut = execFileSync(nmBin, ['--print-size', '--size-sort', '--reverse-sort', '-C', elfPath], {
        encoding: 'utf8',
        timeout: 8000,
        maxBuffer: 16 * 1024 * 1024,
      });

      for (const line of nmOut.split(/\r?\n/)) {
        // Format: <addr> <size> <type> <name>
        const m = line.trim().match(/^([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+([A-Za-z?])\s+(.+)$/);
        if (!m) continue;
        const address = `0x${m[1]}`;
        const size = parseInt(m[2], 16);
        const symType = m[3];
        const name = m[4].trim();
        if (size <= 0) continue;

        if (symType === 'T' || symType === 't' || symType === 'R' || symType === 'r' || symType === 'W' || symType === 'w') {
          flashSyms.push({ name, size, type: symType, address, region: 'flash' });
        } else if (symType === 'B' || symType === 'b' || symType === 'D' || symType === 'd' || symType === 'S' || symType === 's') {
          ramSyms.push({ name, size, type: symType, address, region: 'ram' });
        }
      }
    } catch {
      source = 'map';
    }
  } else {
    source = 'map';
  }

  // 3. Fallback: parse .map file if nm yielded nothing
  if (flashSyms.length === 0 && ramSyms.length === 0 && fs.existsSync(mapPath)) {
    source = 'map';
    const mapText = fs.readFileSync(mapPath, 'utf8');
    for (const line of mapText.split(/\r?\n/)) {
      // Matches GNU ld map section entries: .text.foo  0x08001234  0x1a0  obj.o
      const m = line.match(/^\s*\.(text|rodata|data|bss)\.([^\s]+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)/);
      if (!m) continue;
      const sec = m[1];
      const name = m[2];
      const address = m[3];
      const size = parseInt(m[4], 16);
      if (size <= 0) continue;
      if (sec === 'text' || sec === 'rodata') {
        flashSyms.push({ name, size, type: sec, address, region: 'flash' });
      } else {
        ramSyms.push({ name, size, type: sec, address, region: 'ram' });
      }
    }
    flashSyms.sort((a, b) => b.size - a.size);
    ramSyms.sort((a, b) => b.size - a.size);
  }

  const flashUsed = textBytes + dataBytes || flashSyms.reduce((s, e) => s + e.size, 0);
  const ramUsed = dataBytes + bssBytes || ramSyms.reduce((s, e) => s + e.size, 0);

  return {
    elfPath: toPosixPath(elfPath),
    flashUsed,
    ramUsed,
    textBytes,
    dataBytes,
    bssBytes,
    topFlash: flashSyms.slice(0, 30),
    topRam: ramSyms.slice(0, 30),
    source,
  };
}

/** Encode a binary buffer at baseAddress into standard Intel HEX (I32HEX) format */
function bufferToIntelHex(buf: Buffer, baseAddress: number): string {
  const lines: string[] = [];
  let currentUpper = -1;

  const formatRecord = (byteCount: number, addr16: number, type: number, data: number[]): string => {
    const bytes = [byteCount, (addr16 >> 8) & 0xff, addr16 & 0xff, type, ...data];
    const sum = bytes.reduce((a, b) => a + b, 0);
    const checksum = (-sum) & 0xff;
    return ':' + [...bytes, checksum].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
  };

  for (let offset = 0; offset < buf.length; offset += 16) {
    const absAddr = baseAddress + offset;
    const upper = (absAddr >>> 16) & 0xffff;
    if (upper !== currentUpper) {
      currentUpper = upper;
      lines.push(formatRecord(2, 0, 4, [(upper >> 8) & 0xff, upper & 0xff]));
    }
    const chunkLen = Math.min(16, buf.length - offset);
    const chunk: number[] = [];
    for (let i = 0; i < chunkLen; i++) chunk.push(buf[offset + i]);
    lines.push(formatRecord(chunkLen, absAddr & 0xffff, 0, chunk));
  }

  lines.push(':00000001FF');
  return lines.join('\n') + '\n';
}

/**
 * Merge multiple IAP program .bin files into a single production .bin + .hex
 * Gaps between Flash segments are padded with 0xFF (erased NOR Flash state).
 */
export function mergeWorkspaceFirmware(
  workspaceDir: string,
  programs: McuProjectConfig[]
): MergeFirmwareResult {
  const items: Array<{ name: string; origin: number; originHex: string; buf: Buffer; binFile: string }> = [];

  for (const prog of programs) {
    const binFile = path.resolve(prog.projectDir, prog.buildDir || 'build', `${prog.name}.bin`);
    if (!fs.existsSync(binFile)) {
      throw new Error(`程序 "${prog.name}" 尚未生成 ${toPosixPath(binFile)}，请先执行“全部编译”。`);
    }
    const originStr = prog.memoryLayout?.flashOrigin?.trim() || '0x08000000';
    const origin = parseInt(originStr, 16);
    if (Number.isNaN(origin)) {
      throw new Error(`程序 "${prog.name}" 的 Flash 起始地址无效: ${originStr}`);
    }
    items.push({
      name: prog.name,
      origin,
      originHex: originStr,
      buf: fs.readFileSync(binFile),
      binFile: toPosixPath(binFile),
    });
  }

  if (items.length === 0) {
    throw new Error('没有可合并的程序段。');
  }

  items.sort((a, b) => a.origin - b.origin);

  // Check overlap before merging
  for (let i = 1; i < items.length; i++) {
    const prevEnd = items[i - 1].origin + items[i - 1].buf.length;
    if (items[i].origin < prevEnd) {
      throw new Error(
        `固件合并失败：${items[i - 1].name} (结束于 0x${prevEnd.toString(16)}) 与 ${items[i].name} (起始于 ${items[i].originHex}) 发生地址重叠！`
      );
    }
  }

  const baseAddress = items[0].origin;
  const maxEnd = Math.max(...items.map((it) => it.origin + it.buf.length));
  const totalBytes = maxEnd - baseAddress;

  // Guard against absurd address gaps (> 64MB)
  if (totalBytes > 64 * 1024 * 1024) {
    throw new Error(`合并后固件跨度超过 64MB (${totalBytes} bytes)，请检查各程序 Flash 起始地址。`);
  }

  const merged = Buffer.alloc(totalBytes, 0xff);
  for (const it of items) {
    it.buf.copy(merged, it.origin - baseAddress);
  }

  const outDir = path.join(path.resolve(workspaceDir), 'merged_output');
  fs.mkdirSync(outDir, { recursive: true });
  const binPath = path.join(outDir, 'merged_firmware.bin');
  const hexPath = path.join(outDir, 'merged_firmware.hex');

  fs.writeFileSync(binPath, merged);
  fs.writeFileSync(hexPath, bufferToIntelHex(merged, baseAddress), 'utf8');

  return {
    binPath: toPosixPath(binPath),
    hexPath: toPosixPath(hexPath),
    baseAddress,
    totalBytes,
    segments: items.map((it) => ({
      name: it.name,
      origin: it.originHex,
      size: it.buf.length,
      binFile: it.binFile,
    })),
  };
}
