import React, { useEffect, useState } from 'react';
import { FileCode, Save, RefreshCw } from 'lucide-react';
import { GeneratedFilePreview, McuProjectConfig } from '../types/api';

interface PreviewPanelProps {
  config: McuProjectConfig;
  onApply: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({ config, onApply }) => {
  const [previews, setPreviews] = useState<GeneratedFilePreview[]>([]);
  const [selected, setSelected] = useState<string>('');

  const loadPreviews = async () => {
    const list = await window.mcuForge.previewGenerated(config);
    setPreviews(list);
    if (list.length > 0 && !list.some((p) => p.relativePath === selected)) {
      setSelected(list[0].relativePath);
    }
  };

  useEffect(() => {
    loadPreviews();
  }, [config]);

  const active = previews.find((p) => p.relativePath === selected) ?? previews[0];

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <div>
          <div className="card-title">
            <FileCode size={16} color="#60a5fa" />
            待生成文件实时预览 ({previews.length} 个文件)
          </div>
          <div className="card-desc">写入前可逐一审查即将生成的 Makefile / CMakeLists.txt / .clangd / .vscode/* 文件。</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={loadPreviews}>
            <RefreshCw size={13} /> 刷新预览
          </button>
          <button className="btn btn-primary btn-sm" onClick={onApply}>
            <Save size={13} /> 写入全部文件到工程
          </button>
        </div>
      </div>

      <div className="chip-list" style={{ marginBottom: 12 }}>
        {previews.map((p) => (
          <button
            key={p.relativePath}
            className={`btn btn-sm ${active?.relativePath === p.relativePath ? 'btn-primary' : ''}`}
            onClick={() => setSelected(p.relativePath)}
          >
            {p.relativePath}
            {p.existed && <span style={{ opacity: 0.7, fontSize: 10 }}>(覆盖)</span>}
          </button>
        ))}
      </div>

      {active && (
        <div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-secondary)',
              marginBottom: 6,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {active.absolutePath} ({active.content.length} bytes)
          </div>
          <pre className="code-preview">{active.content}</pre>
        </div>
      )}
    </div>
  );
};
