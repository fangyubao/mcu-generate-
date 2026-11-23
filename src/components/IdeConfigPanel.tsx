import React from 'react';
import { Code2, ExternalLink, Sparkles } from 'lucide-react';
import { McuProjectConfig } from '../types/api';

interface IdeConfigPanelProps {
  config: McuProjectConfig;
  onChange: (next: McuProjectConfig) => void;
  onApply: () => void;
  onOpenVscode: () => void;
}

export const IdeConfigPanel: React.FC<IdeConfigPanelProps> = ({
  config,
  onChange,
  onApply,
  onOpenVscode,
}) => {
  const ide = config.ide;
  const updateIde = (patch: Partial<McuProjectConfig['ide']>) => {
    onChange({ ...config, ide: { ...ide, ...patch } });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Sparkles size={16} color="#60a5fa" />
              VSCode / Vim / Neovim + clangd 无缝集成
            </div>
            <div className="card-desc">
              自动生成标准 compile_commands.json、.clangd 与 .vscode 全家桶配置，打开即享智能报错、代码补全、头文件跳转与 F5 在线调试。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={onApply}>
              一键生成并写入配置
            </button>
            <button className="btn btn-success" onClick={onOpenVscode}>
              <ExternalLink size={14} /> 在 VSCode 中打开
            </button>
          </div>
        </div>

        <div className="grid-2" style={{ gap: 14, marginBottom: 16 }}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ide.generateCompileCommands}
              onChange={(e) => updateIde({ generateCompileCommands: e.target.checked })}
            />
            生成 compile_commands.json（VSCode clangd &amp; Vim/Neovim LSP 索引核心）
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ide.generateClangd}
              onChange={(e) => updateIde({ generateClangd: e.target.checked })}
            />
            生成 .clangd（自动过滤交叉编译不兼容标志，开启后台索引）
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ide.generateVscodeTasks}
              onChange={(e) => updateIde({ generateVscodeTasks: e.target.checked })}
            />
            生成 .vscode/tasks.json（一键 Build / Clean / Flash）
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ide.generateVscodeLaunch}
              onChange={(e) => updateIde({ generateVscodeLaunch: e.target.checked })}
            />
            生成 .vscode/launch.json（Cortex-Debug / GDB 一键 F5 在线调试）
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ide.generateVscodeSettings}
              onChange={(e) => updateIde({ generateVscodeSettings: e.target.checked })}
            />
            生成 .vscode/settings.json（自动注入 --query-driver 与工具链路径）
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ide.generateVscodeExtensions}
              onChange={(e) => updateIde({ generateVscodeExtensions: e.target.checked })}
            />
            生成 .vscode/extensions.json（自动推荐 clangd &amp; cortex-debug 插件）
          </label>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={ide.backupBeforeOverwrite}
              onChange={(e) => updateIde({ backupBeforeOverwrite: e.target.checked })}
            />
            覆盖已有文件前自动创建 .bak 备份（首次覆盖时保留原文件，安全无忧）
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Code2 size={16} color="#34d399" />
            Vim / Neovim 无缝接入说明
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          生成的 <code style={{ color: '#e6edf3' }}>compile_commands.json</code> 与{' '}
          <code style={{ color: '#e6edf3' }}>.clangd</code> 位于工程根目录，完全遵循 LLVM LSP 规范。
          在 Vim (coc-clangd / YouCompleteMe) 或 Neovim (nvim-lspconfig + clangd) 中直接打开工程目录即可自动启用：
          <ul style={{ marginLeft: 18, marginTop: 6 }}>
            <li>跨文件精确符号跳转（gd）与引用查找（gr）</li>
            <li>基于真实交叉编译器头文件的零误报智能诊断</li>
            <li>只需在 Neovim clangd 启动参数中加上 <code style={{ color: '#60a5fa' }}>--query-driver=**/*gcc*</code> 即可自动解析 ARM/RISC-V 标准库</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
