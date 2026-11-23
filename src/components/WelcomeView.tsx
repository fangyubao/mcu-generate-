import React from 'react';
import { Cpu, FileCode2, FolderOpen, PlusCircle, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { EnvironmentReport } from '../types/api';

interface WelcomeViewProps {
  env: EnvironmentReport | null;
  recentProjects: string[];
  onImportClick: () => void;
  onImportKeilClick: () => void;
  onImportPath: (dir: string) => void;
  onNewClick: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  env,
  recentProjects,
  onImportClick,
  onImportKeilClick,
  onImportPath,
  onNewClick,
}) => {
  const compilerCount = env?.tools.filter((t) => t.category === 'compiler').length ?? 0;
  const buildCount = env?.tools.filter((t) => t.category === 'build').length ?? 0;
  const dbgCount = env?.tools.filter((t) => t.category === 'debugger').length ?? 0;

  return (
    <div className="welcome-screen">
      <div className="welcome-box">
        <div className="welcome-hero">
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <img
              src="./logo.png"
              alt="MCU Forge Studio"
              style={{
                width: 84,
                height: 84,
                objectFit: 'contain',
                filter: 'drop-shadow(0 6px 20px rgba(59, 130, 246, 0.42))',
              }}
            />
          </div>
          <h1>MCU Forge Studio</h1>
          <p style={{ maxWidth: 680, margin: '0 auto' }}>
            <strong style={{ color: '#e6edf3' }}>新一代跨平台嵌入式工程重构与智能构建工作台</strong>（Windows · macOS · Linux）
            <br />
            一键接管 STM32CubeMX / Keil MDK / Makefile / CMake 工程，内置类 Keil 可视化分组管理、IAP 多程序段协同与固件合并、
            自定义工具链与烧录器适配，并自动生成 VSCode / Vim + <code style={{ color: '#93c5fd' }}>clangd</code> 零配置开发与在线调试环境。
          </p>
        </div>

        <div className="action-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <button className="action-card" onClick={onImportClick}>
            <FolderOpen size={26} color="#60a5fa" />
            <h3>导入已有工程文件夹</h3>
            <p>
              自动解析 Makefile / CMakeLists.txt 及多程序 IAP 工作区，纯只读导入不改动原脚本。
            </p>
          </button>

          <button className="action-card" onClick={onImportKeilClick}>
            <FileCode2 size={26} color="#34d399" />
            <h3>导入 Keil (.uvprojx)</h3>
            <p>
              一键解析 Keil MDK 工程的分组、源码、头文件路径与宏定义，直接转为跨平台 Makefile / CMake + VSCode。
            </p>
          </button>

          <button className="action-card" onClick={onNewClick}>
            <PlusCircle size={26} color="#a78bfa" />
            <h3>新建 MCU / 纯 C 工程</h3>
            <p>
              支持单程序或 IAP 多程序段（可指定 Flash 起始地址），兼容非 STM32 与纯 C 工程。
            </p>
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div className="card">
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title">
                <Clock size={15} color="#60a5fa" />
                最近打开的工程
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentProjects.map((dir) => (
                <button
                  key={dir}
                  className="btn"
                  style={{ justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  onClick={() => onImportPath(dir)}
                >
                  <span>{dir}</span>
                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>打开 →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header" style={{ marginBottom: 10 }}>
            <div className="card-title">
              本机环境探测 ({env ? `${env.platform} / ${env.arch}` : '探测中...'})
            </div>
            <span className={compilerCount > 0 ? 'status-pill' : 'status-pill warn'}>
              {compilerCount > 0 ? `已发现 ${env?.tools.length ?? 0} 项工具` : '可随时手动导入工具链'}
            </span>
          </div>
          <div className="grid-3" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {compilerCount > 0 ? <CheckCircle2 size={14} color="#22c55e" /> : <AlertTriangle size={14} color="#f59e0b" />}
              编译器: {compilerCount} 个
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {buildCount > 0 ? <CheckCircle2 size={14} color="#22c55e" /> : <AlertTriangle size={14} color="#f59e0b" />}
              构建工具 (Make/CMake): {buildCount} 个
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {dbgCount > 0 ? <CheckCircle2 size={14} color="#22c55e" /> : <AlertTriangle size={14} color="#f59e0b" />}
              调试/烧录器: {dbgCount} 个
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
