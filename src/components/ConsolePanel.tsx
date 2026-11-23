import React, { useEffect, useMemo, useRef } from 'react';
import { Square, Terminal, Trash2 } from 'lucide-react';
import { RunCommandEvent } from '../types/api';

interface ConsolePanelProps {
  projectDir?: string;
  logs: RunCommandEvent[];
  isRunning: boolean;
  memoryUsage: RunCommandEvent['memoryUsage'] | null;
  onClear: () => void;
  onStop: () => void;
  onOpenLocation?: (file: string, line: number, col?: number) => void;
}

function classifyLogLine(line: string, evType: RunCommandEvent['type']): string {
  if (evType === 'info') return 'log-info';
  const lower = line.toLowerCase();
  if (
    /\b(fatal error|error):/i.test(line) ||
    lower.includes('undefined reference') ||
    lower.includes('multiple definition') ||
    lower.includes('ld returned') ||
    lower.includes('failed to start') ||
    /^\*\*\*|\bstop\.$/.test(lower.trim())
  ) {
    return 'log-error';
  }
  if (/\bwarning\b|\bwarn\b|deprecated/i.test(line)) {
    return 'log-warning';
  }
  if (/\bnote:/i.test(line) || /^in function\b|^in file included from\b/i.test(line.trim())) {
    return 'log-note';
  }
  if (evType === 'stderr') {
    if (/^info\s*:/i.test(line.trim())) return 'log-stdout';
    return 'log-warning';
  }
  return 'log-stdout';
}

// Match GCC/Clang file:line:col locations like Core/Src/main.c:42:10 or E:/proj/a.c:12:
const FILE_LOC_REGEX = /([A-Za-z0-9_./\\-]+\.(?:c|cpp|cc|cxx|h|hpp|s|S|ld)):(\d+)(?::(\d+))?/g;

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  logs,
  isRunning,
  memoryUsage,
  onClear,
  onStop,
  onOpenLocation,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const { errorCount, warningCount } = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const ev of logs) {
      for (const line of ev.data.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const cls = classifyLogLine(line, ev.type);
        if (cls === 'log-error') errors++;
        else if (cls === 'log-warning' && /\bwarning\b|\bwarn\b/i.test(line)) warnings++;
      }
    }
    return { errorCount: errors, warningCount: warnings };
  }, [logs]);

  const flashBytes = memoryUsage ? memoryUsage.text + memoryUsage.data : 0;
  const ramBytes = memoryUsage ? memoryUsage.data + memoryUsage.bss : 0;

  const renderLineWithLinks = (line: string, cls: string) => {
    if (!onOpenLocation) return line;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    FILE_LOC_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FILE_LOC_REGEX.exec(line)) !== null) {
      if (m.index > lastIdx) parts.push(line.slice(lastIdx, m.index));
      const fullMatch = m[0];
      const file = m[1];
      const lineNum = parseInt(m[2], 10);
      const colNum = m[3] ? parseInt(m[3], 10) : undefined;
      parts.push(
        <span
          key={`${m.index}-${fullMatch}`}
          className="log-link"
          title={`点击在 VSCode 中打开 ${file}:${lineNum}`}
          onClick={() => onOpenLocation(file, lineNum, colNum)}
        >
          {fullMatch}
        </span>
      );
      lastIdx = m.index + fullMatch.length;
    }
    if (lastIdx === 0) return line;
    if (lastIdx < line.length) parts.push(line.slice(lastIdx));
    return <span className={cls}>{parts}</span>;
  };

  return (
    <div className="console-panel">
      <div className="console-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <Terminal size={14} color="#60a5fa" />
            构建 / 烧录输出终端
          </div>
          {isRunning && <span className="status-pill warn">运行中...</span>}
          {errorCount > 0 && <span className="status-pill danger">Errors: {errorCount}</span>}
          {warningCount > 0 && <span className="status-pill warn">Warnings: {warningCount}</span>}
          {memoryUsage && (
            <div style={{ display: 'flex', gap: 12, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: '#93c5fd' }}>
              <span>FLASH: {(flashBytes / 1024).toFixed(2)} KB ({flashBytes} B)</span>
              <span>RAM: {(ramBytes / 1024).toFixed(2)} KB ({ramBytes} B)</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {isRunning && (
            <button className="btn btn-sm btn-danger" onClick={onStop}>
              <Square size={11} /> 停止
            </button>
          )}
          <button className="btn btn-sm" onClick={onClear}>
            <Trash2 size={12} /> 清空
          </button>
        </div>
      </div>

      <div className="console-body">
        {logs.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>
            就绪。点击顶部工具栏的“生成配置”、“编译”或“烧录”查看实时输出（点击报错路径可直达 VSCode 源码行）...
          </span>
        ) : (
          logs.map((ev, idx) =>
            ev.data.split(/(\r?\n)/).map((part, subIdx) => {
              if (!part) return null;
              if (part === '\n' || part === '\r\n') {
                return <React.Fragment key={`${idx}-${subIdx}`}>{part}</React.Fragment>;
              }
              const cls = classifyLogLine(part, ev.type);
              return (
                <span key={`${idx}-${subIdx}`} className={cls}>
                  {renderLineWithLinks(part, cls)}
                </span>
              );
            })
          )
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
