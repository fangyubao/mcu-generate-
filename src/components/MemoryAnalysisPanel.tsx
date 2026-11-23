import React, { useState } from 'react';
import { BarChart3, RefreshCw, AlertTriangle } from 'lucide-react';
import { McuProjectConfig, MemoryAnalysisReport, SymbolEntry } from '../types/api';

interface MemoryAnalysisPanelProps {
  config: McuProjectConfig;
}

function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${b} B`;
}

export const MemoryAnalysisPanel: React.FC<MemoryAnalysisPanelProps> = ({ config }) => {
  const [report, setReport] = useState<MemoryAnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.mcuForge.analyzeMemory(config);
      setReport(res);
    } catch (err) {
      setError((err as Error).message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const renderSymbolTable = (title: string, items: SymbolEntry[], total: number, barColor: string) => (
    <div className="card">
      <div className="card-header" style={{ marginBottom: 10 }}>
        <div className="card-title">{title}</div>
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          Top {items.length} 符号
        </span>
      </div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>暂无符号明细</div>
      ) : (
        <table className="mem-table">
          <thead>
            <tr>
              <th>符号 / 函数 / 变量名</th>
              <th style={{ width: 95 }}>地址</th>
              <th style={{ width: 90 }}>大小</th>
              <th style={{ width: 120 }}>占比</th>
            </tr>
          </thead>
          <tbody>
            {items.map((sym, idx) => {
              const pct = total > 0 ? Math.min(100, (sym.size / total) * 100) : 0;
              return (
                <tr key={`${sym.name}-${idx}`}>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sym.name}>
                    {sym.name}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{sym.address}</td>
                  <td>{formatBytes(sym.size)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="mem-bar-bg">
                        <div className="mem-bar-fill" style={{ width: `${Math.max(2, pct)}%`, background: barColor }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', width: 38, textAlign: 'right' }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ marginBottom: report || error ? 14 : 0 }}>
          <div>
            <div className="card-title">
              <BarChart3 size={16} color="#60a5fa" />
              固件 Flash / RAM 体积与符号占用分析
            </div>
            <div className="card-desc">
              通过工具链 nm / size 或 .map 文件分析编译产物，快速定位占用最多 Flash 与 RAM 的函数及全局数组。
            </div>
          </div>
          <button className="btn btn-primary" disabled={loading} onClick={runAnalysis}>
            <RefreshCw size={14} /> {loading ? '分析中...' : '分析当前固件'}
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
            }}
          >
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {report && (
          <div className="grid-2" style={{ marginTop: 6 }}>
            <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                FLASH 总占用 (text + data)
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>
                {formatBytes(report.flashUsed)}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                  ({report.flashUsed.toLocaleString()} bytes)
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                .text = {report.textBytes} B · .data = {report.dataBytes} B · 来源: {report.source.toUpperCase()}
              </div>
            </div>

            <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                RAM 总占用 (data + bss)
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                {formatBytes(report.ramUsed)}
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                  ({report.ramUsed.toLocaleString()} bytes)
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                .data = {report.dataBytes} B · .bss = {report.bssBytes} B
              </div>
            </div>
          </div>
        )}
      </div>

      {report && (
        <>
          {renderSymbolTable('FLASH 占用 Top 符号（代码与常量）', report.topFlash, report.flashUsed, '#3b82f6')}
          {renderSymbolTable('RAM 占用 Top 符号（全局/静态变量与缓冲区）', report.topRam, report.ramUsed, '#a855f7')}
        </>
      )}
    </div>
  );
};
