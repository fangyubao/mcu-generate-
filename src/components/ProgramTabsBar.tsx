import React, { useMemo, useState } from 'react';
import { AlertTriangle, Combine, Cpu, FolderPlus, Hammer, Plus, X } from 'lucide-react';
import { McuProjectConfig, NewProgramSegment } from '../types/api';

interface ProgramTabsBarProps {
  programs: McuProjectConfig[];
  activeIndex: number;
  isRunning: boolean;
  onSelect: (index: number) => void;
  onCloseTab: (index: number) => void;
  onImportSubProgram: () => void;
  onCreateSegment: (seg: NewProgramSegment, createStarterFiles: boolean) => void;
  onBuildAll: () => void;
  onMergeFirmware: () => void;
}

const SEG_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2'];

function parseHexAddr(str?: string): number | null {
  if (!str) return null;
  const n = parseInt(str.trim(), 16);
  return Number.isNaN(n) ? null : n;
}

function parseSizeBytes(str?: string): number | null {
  if (!str) return null;
  const m = str.trim().match(/^(\d+)\s*([kKmM])?$/);
  if (!m) return null;
  const val = parseInt(m[1], 10);
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'K') return val * 1024;
  if (unit === 'M') return val * 1024 * 1024;
  return val;
}

export const ProgramTabsBar: React.FC<ProgramTabsBarProps> = ({
  programs,
  activeIndex,
  isRunning,
  onSelect,
  onCloseTab,
  onImportSubProgram,
  onCreateSegment,
  onBuildAll,
  onMergeFirmware,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [segName, setSegName] = useState('app');
  const [subDir, setSubDir] = useState('app');
  const [flashOrigin, setFlashOrigin] = useState('0x08008000');
  const [flashLength, setFlashLength] = useState('480K');
  const [createStarter, setCreateStarter] = useState(true);

  /** Detect Flash address overlap across multiple programs */
  const overlapWarning = useMemo(() => {
    const ranges: Array<{ name: string; start: number; end: number }> = [];
    for (const p of programs) {
      const start = parseHexAddr(p.memoryLayout?.flashOrigin);
      const len = parseSizeBytes(p.memoryLayout?.flashLength);
      if (start !== null && len !== null && len > 0) {
        ranges.push({ name: p.name, start, end: start + len });
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].start < ranges[i - 1].end) {
        return `Flash 地址重叠: ${ranges[i - 1].name} 与 ${ranges[i].name}`;
      }
    }
    return null;
  }, [programs]);

  /** Compute visual Flash memory map segments when >= 2 programs define flashOrigin/Length */
  const flashMapSegments = useMemo(() => {
    const raw: Array<{ idx: number; name: string; start: number; len: number; originHex: string; lenStr: string }> = [];
    for (let i = 0; i < programs.length; i++) {
      const p = programs[i];
      const start = parseHexAddr(p.memoryLayout?.flashOrigin);
      const len = parseSizeBytes(p.memoryLayout?.flashLength);
      if (start !== null && len !== null && len > 0) {
        raw.push({
          idx: i,
          name: p.name,
          start,
          len,
          originHex: p.memoryLayout!.flashOrigin,
          lenStr: p.memoryLayout!.flashLength,
        });
      }
    }
    if (raw.length < 2) return null;
    raw.sort((a, b) => a.start - b.start);
    const minAddr = raw[0].start;
    const maxAddr = Math.max(...raw.map((r) => r.start + r.len));
    const totalSpan = Math.max(1, maxAddr - minAddr);
    return {
      minAddr,
      maxAddr,
      totalSpan,
      items: raw.map((r, i) => ({
        ...r,
        leftPct: ((r.start - minAddr) / totalSpan) * 100,
        widthPct: Math.max(4, (r.len / totalSpan) * 100),
        color: SEG_COLORS[i % SEG_COLORS.length],
      })),
    };
  }, [programs]);

  const handleSubmitNewSegment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!segName.trim()) return;
    onCreateSegment(
      {
        name: segName.trim(),
        subDir: subDir.trim() || segName.trim(),
        flashOrigin: flashOrigin.trim(),
        flashLength: flashLength.trim(),
      },
      createStarter
    );
    setShowAddModal(false);
  };

  return (
    <>
      <div className="program-tabs-bar">
        <div className="program-tabs-list">
          {programs.map((prog, idx) => {
            const isActive = idx === activeIndex;
            const origin = prog.memoryLayout?.flashOrigin;
            return (
              <div
                key={`${prog.projectDir}-${idx}`}
                className={`program-tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelect(idx)}
                title={`${prog.name}\n路径: ${prog.projectDir}${origin ? `\nFlash 起始地址: ${origin}` : ''}`}
              >
                <Cpu size={13} color={isActive ? '#60a5fa' : '#6e7681'} />
                <span>{prog.name}</span>
                {origin && <span className="program-addr-badge">{origin}</span>}
                {programs.length > 1 && (
                  <button
                    className="btn-icon"
                    style={{ padding: 1, marginLeft: 2 }}
                    title="关闭此程序标签（不删除磁盘文件）"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(idx);
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}

          <button
            className="btn btn-sm"
            style={{ height: 26, padding: '0 8px', marginLeft: 4 }}
            title="在当前工程中新增程序段（如 IAP Bootloader / App）"
            onClick={() => {
              const nextNum = programs.length + 1;
              setSegName(`app_${nextNum}`);
              setSubDir(`app_${nextNum}`);
              setShowAddModal(true);
            }}
          >
            <Plus size={13} /> 新增程序段
          </button>

          <button
            className="btn btn-sm"
            style={{ height: 26, padding: '0 8px' }}
            title="导入同工程或外部已有子程序目录作为新标签"
            onClick={onImportSubProgram}
          >
            <FolderPlus size={13} /> 导入子程序
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {overlapWarning && (
            <span className="status-pill danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12} /> {overlapWarning}
            </span>
          )}
          {programs.length > 1 && (
            <>
              <button
                className="btn btn-sm"
                style={{ height: 26 }}
                disabled={isRunning}
                onClick={onBuildAll}
                title="按顺序编译工作区内的全部程序段"
              >
                <Hammer size={12} color="#60a5fa" /> 全部编译
              </button>
              <button
                className="btn btn-sm btn-success"
                style={{ height: 26 }}
                disabled={isRunning}
                onClick={onMergeFirmware}
                title="按各自 Flash 起始地址合并为单个产线 .bin 与 .hex 固件"
              >
                <Combine size={12} /> 合并固件
              </button>
            </>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            共 {programs.length} 个程序
          </span>
        </div>
      </div>

      {/* Visual Flash Memory Map Bar (multi-program IAP view) */}
      {flashMapSegments && (
        <div className="flash-map-bar">
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
            FLASH 分布: 0x{flashMapSegments.minAddr.toString(16).toUpperCase()}
          </span>
          <div className="flash-map-track">
            {flashMapSegments.items.map((seg) => (
              <div
                key={`${seg.name}-${seg.idx}`}
                className="flash-map-seg"
                style={{
                  position: 'absolute',
                  left: `${seg.leftPct}%`,
                  width: `${seg.widthPct}%`,
                  background: seg.color,
                  outline: seg.idx === activeIndex ? '2px solid #fff' : 'none',
                }}
                title={`${seg.name}: ${seg.originHex} ~ 0x${(seg.start + seg.len).toString(16).toUpperCase()} (${seg.lenStr})`}
                onClick={() => onSelect(seg.idx)}
              >
                {seg.name} ({seg.lenStr})
              </div>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
            0x{flashMapSegments.maxAddr.toString(16).toUpperCase()}
          </span>
        </div>
      )}

      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ width: 480 }}>
            <div className="card-header">
              <div>
                <div className="card-title">新增程序段（IAP / 多程序）</div>
                <div className="card-desc">将在当前工作区下创建独立子程序目录及 Makefile/CMake 配置。</div>
              </div>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitNewSegment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="grid-2">
                <div className="field">
                  <label>程序名称 (TARGET) *</label>
                  <input
                    className="input mono"
                    value={segName}
                    onChange={(e) => {
                      setSegName(e.target.value);
                      setSubDir(e.target.value);
                    }}
                    placeholder="如: bootloader 或 app"
                    required
                  />
                </div>
                <div className="field">
                  <label>子目录名称 *</label>
                  <input
                    className="input mono"
                    value={subDir}
                    onChange={(e) => setSubDir(e.target.value)}
                    placeholder="如: bootloader"
                    required
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>Flash 起始地址（可选）</label>
                  <input
                    className="input mono"
                    value={flashOrigin}
                    onChange={(e) => setFlashOrigin(e.target.value)}
                    placeholder="0x08008000"
                  />
                </div>
                <div className="field">
                  <label>Flash 空间大小（可选）</label>
                  <input
                    className="input mono"
                    value={flashLength}
                    onChange={(e) => setFlashLength(e.target.value)}
                    placeholder="480K"
                  />
                </div>
              </div>

              <div className="chip-list" style={{ marginTop: 0 }}>
                <button type="button" className="btn btn-sm" onClick={() => { setFlashOrigin('0x08000000'); setFlashLength('32K'); }}>
                  Boot (0x08000000 / 32K)
                </button>
                <button type="button" className="btn btn-sm" onClick={() => { setFlashOrigin('0x08008000'); setFlashLength('480K'); }}>
                  App (0x08008000 / 480K)
                </button>
                <button type="button" className="btn btn-sm" onClick={() => { setFlashOrigin('0x08010000'); setFlashLength('448K'); }}>
                  App (0x08010000 / 448K)
                </button>
                <button type="button" className="btn btn-sm" onClick={() => { setFlashOrigin(''); setFlashLength(''); }}>
                  留空
                </button>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={createStarter}
                  onChange={(e) => setCreateStarter(e.target.checked)}
                />
                自动创建基础源码模板（src/main.c + inc/app.h）
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn" onClick={() => setShowAddModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  添加程序段
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
