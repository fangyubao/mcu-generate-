import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Cpu,
  FileCode2,
  FolderOpen,
  Hammer,
  Play,
  PlusCircle,
  Save,
  Sparkles,
  Trash,
  Wrench,
  FileCode,
  ExternalLink,
  Sliders,
} from 'lucide-react';
import {
  EnvironmentReport,
  McuProjectConfig,
  NewProgramSegment,
  NewWorkspaceOptions,
  RunCommandEvent,
  WorkspaceState,
} from './types/api';
import { WelcomeView } from './components/WelcomeView';
import { NewProjectModal } from './components/NewProjectModal';
import { ProgramTabsBar } from './components/ProgramTabsBar';
import { ProjectTree } from './components/ProjectTree';
import { TargetConfigPanel } from './components/TargetConfigPanel';
import { ToolchainPanel } from './components/ToolchainPanel';
import { IdeConfigPanel } from './components/IdeConfigPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { MemoryAnalysisPanel } from './components/MemoryAnalysisPanel';
import { ConsolePanel } from './components/ConsolePanel';

type ActiveTab = 'target' | 'toolchain' | 'ide' | 'preview' | 'memory';

const RECENT_KEY = 'mcu-forge-recent-projects';

export default function App() {
  const [env, setEnv] = useState<EnvironmentReport | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('target');
  const [showNewModal, setShowNewModal] = useState(false);
  const [logs, setLogs] = useState<RunCommandEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState<RunCommandEvent['memoryUsage'] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const project: McuProjectConfig | null =
    workspace && workspace.programs.length > 0
      ? workspace.programs[workspace.activeIndex] ?? workspace.programs[0]
      : null;

  const updateActiveProject = (next: McuProjectConfig) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const programs = prev.programs.map((p, idx) => (idx === prev.activeIndex ? next : p));
      return { ...prev, programs };
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3600);
  };

  const pushRecent = (dir: string) => {
    setRecentProjects((prev) => {
      const next = [dir, ...prev.filter((d) => d !== dir)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const refreshEnv = async () => {
    const report = await window.mcuForge.detectEnvironment();
    setEnv(report);
  };

  useEffect(() => {
    refreshEnv();
    const unsub = window.mcuForge.onRunnerEvent((ev) => {
      if (ev.memoryUsage) setMemoryUsage(ev.memoryUsage);
      if (ev.type === 'exit') {
        setIsRunning(false);
        setLogs((prev) => [
          ...prev,
          {
            type: ev.exitCode === 0 ? 'info' : 'stderr',
            data: `\n[Process exited with code ${ev.exitCode}]\n`,
          },
        ]);
      } else {
        setLogs((prev) => [...prev, ev]);
      }
    });
    return unsub;
  }, []);

  const handleImportPath = async (dir: string) => {
    try {
      const ws = await window.mcuForge.importWorkspace(dir);
      setWorkspace(ws);
      pushRecent(ws.workspaceDir);
      setLogs([
        {
          type: 'info',
          data: `${ws.importSummary || '导入成功'}\n工作区路径: ${ws.workspaceDir}\n（当前为只读导入，不会改动原有 Makefile；仅在点击“生成配置”时才会写入）\n`,
        },
      ]);
      showToast(ws.importSummary || `已导入 ${ws.programs.length} 个程序`);
    } catch (err) {
      showToast(`导入失败: ${(err as Error).message}`);
    }
  };

  const handleImportClick = async () => {
    const dir = await window.mcuForge.selectDir('选择已有 MCU / Makefile / CMake 工程或 IAP 工作区目录');
    if (dir) await handleImportPath(dir);
  };

  const handleImportKeilClick = async () => {
    const files = await window.mcuForge.selectFiles({
      title: '选择 Keil MDK 工程文件 (.uvprojx)',
      multi: false,
      filters: [{ name: 'Keil MDK Project', extensions: ['uvprojx'] }],
    });
    if (!files.length) return;
    try {
      const ws = await window.mcuForge.importKeilUvprojx(files[0]);
      setWorkspace(ws);
      pushRecent(ws.workspaceDir);
      setLogs([
        {
          type: 'info',
          data: `${ws.importSummary}\n工程根目录: ${ws.workspaceDir}\n（已自动保留原 Keil 分组、头文件与宏定义；检查无误后点击“生成配置”即可输出跨平台 Makefile / VSCode 配置）\n`,
        },
      ]);
      showToast(ws.importSummary || 'Keil 工程导入成功');
    } catch (err) {
      showToast(`Keil 工程解析失败: ${(err as Error).message}`);
    }
  };

  const handleCreateWorkspace = async (opts: NewWorkspaceOptions) => {
    try {
      const res = await window.mcuForge.createWorkspace(opts);
      setWorkspace(res.workspace);
      pushRecent(res.workspace.workspaceDir);
      setShowNewModal(false);
      setLogs([
        {
          type: 'info',
          data: `${res.workspace.importSummary}，共生成 ${res.writtenCount} 个配置文件。\n`,
        },
      ]);
      showToast(res.workspace.importSummary || '新工程创建成功');
    } catch (err) {
      showToast(`创建失败: ${(err as Error).message}`);
    }
  };

  const handleImportSubProgram = async () => {
    if (!workspace) return;
    const dir = await window.mcuForge.selectDir('选择要作为新标签导入的子程序目录');
    if (!dir) return;
    try {
      const { config, importSource } = await window.mcuForge.importProject(dir);
      const existsIdx = workspace.programs.findIndex(
        (p) => p.projectDir.toLowerCase() === config.projectDir.toLowerCase()
      );
      if (existsIdx >= 0) {
        setWorkspace({ ...workspace, activeIndex: existsIdx });
        showToast(`程序 "${config.name}" 已在标签栏中`);
        return;
      }
      const nextPrograms = [...workspace.programs, config];
      setWorkspace({
        ...workspace,
        programs: nextPrograms,
        activeIndex: nextPrograms.length - 1,
      });
      showToast(`已导入子程序 "${config.name}"（${importSource}）`);
    } catch (err) {
      showToast(`导入子程序失败: ${(err as Error).message}`);
    }
  };

  const handleCreateProgramSegment = async (seg: NewProgramSegment, createStarterFiles: boolean) => {
    if (!workspace || !project) return;
    try {
      const res = await window.mcuForge.addProgramSegment(
        workspace.workspaceDir,
        project,
        seg,
        createStarterFiles
      );
      const nextPrograms = [...workspace.programs, res.config];
      await window.mcuForge.saveWorkspaceMeta(
        workspace.workspaceDir,
        nextPrograms.map((p) => p.projectDir)
      );
      setWorkspace({
        ...workspace,
        programs: nextPrograms,
        activeIndex: nextPrograms.length - 1,
      });
      showToast(`已新增程序段 "${res.config.name}"`);
    } catch (err) {
      showToast(`新增程序段失败: ${(err as Error).message}`);
    }
  };

  const handleCloseProgramTab = (index: number) => {
    if (!workspace || workspace.programs.length <= 1) return;
    const nextPrograms = workspace.programs.filter((_, i) => i !== index);
    const nextIndex = Math.min(workspace.activeIndex, nextPrograms.length - 1);
    setWorkspace({ ...workspace, programs: nextPrograms, activeIndex: nextIndex });
  };

  const handleApplyFiles = async () => {
    if (!project) return;
    try {
      const res = await window.mcuForge.applyGenerated(project);
      setLogs((prev) => [
        ...prev,
        {
          type: 'info',
          data: `[MCU Forge: ${project.name}] 已写入 ${res.written.length} 个文件: ${res.written.join(', ')}\n${
            res.backedUp.length ? `[Backup] 已自动备份: ${res.backedUp.join(', ')}\n` : ''
          }`,
        },
      ]);
      showToast(`已为 "${project.name}" 生成并写入 ${res.written.length} 个文件`);
    } catch (err) {
      showToast(`写入失败: ${(err as Error).message}`);
    }
  };

  const handleRunAction = async (action: 'build' | 'clean' | 'flash' | 'rebuild') => {
    if (!project) return;
    setLogs([]);
    setMemoryUsage(null);
    setIsRunning(true);
    await window.mcuForge.runAction(project, action);
  };

  const handleBuildAll = async () => {
    if (!workspace || workspace.programs.length === 0) return;
    setLogs([]);
    setMemoryUsage(null);
    setIsRunning(true);
    await window.mcuForge.runBuildAll(workspace.programs);
  };

  const handleMergeFirmware = async () => {
    if (!workspace) return;
    try {
      const res = await window.mcuForge.mergeFirmware(workspace.workspaceDir, workspace.programs);
      const segLines = res.segments
        .map((s) => `  - ${s.name} @ ${s.origin} (${s.size} bytes)`)
        .join('\n');
      setLogs((prev) => [
        ...prev,
        {
          type: 'info',
          data: `\n[IAP 固件合并成功] 共合并 ${res.segments.length} 个程序段，总大小 ${res.totalBytes} bytes\n${segLines}\n输出 BIN: ${res.binPath}\n输出 HEX: ${res.hexPath}\n`,
        },
      ]);
      showToast(`合并成功：merged_firmware.bin / .hex (${(res.totalBytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      showToast(`合并失败: ${(err as Error).message}`);
      setLogs((prev) => [...prev, { type: 'stderr', data: `Error: ${(err as Error).message}\n` }]);
    }
  };

  const handleOpenVscode = async () => {
    if (!project) return;
    const res = await window.mcuForge.openInVscode(project.projectDir);
    if (res.ok) {
      showToast(`正在通过 VSCode 打开 ${project.name}...`);
    } else {
      showToast(`未找到 VSCode CLI (code): ${res.error || ''}`);
    }
  };

  const handleOpenLocation = async (file: string, line: number, col?: number) => {
    if (!project) return;
    const res = await window.mcuForge.openFileInVscode(project.projectDir, file, line, col);
    if (!res.ok) {
      showToast(`无法跳转到 VSCode: ${res.error || ''}`);
    }
  };

  return (
    <div className="app-shell">
      {/* Transparent Anime Background Layer + Frosted Dark Scrim */}
      <div className="app-bg-layer" style={{ backgroundImage: "url('./bg.jpg')" }} />
      <div className="app-bg-scrim" />

      <div className="app-foreground">
      {/* Top Toolbar (Integrated Dark Titlebar) */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand" style={{ cursor: 'pointer' }} onClick={() => setWorkspace(null)}>
            <img src="./logo.png" alt="MCU Forge Logo" className="brand-logo" />
            MCU Forge Studio
            <span className="brand-badge">{env?.platform || 'cross-platform'}</span>
          </div>

          <button className="btn btn-sm" onClick={handleImportClick}>
            <FolderOpen size={13} /> 导入工程
          </button>
          <button className="btn btn-sm" onClick={handleImportKeilClick} title="导入 Keil MDK .uvprojx 并转换为跨平台工程">
            <FileCode2 size={13} color="#34d399" /> 导入 Keil
          </button>
          <button className="btn btn-sm" onClick={() => setShowNewModal(true)}>
            <PlusCircle size={13} /> 新建工程
          </button>
        </div>

        {project && (
          <div className="topbar-center">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                maxWidth: 280,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={project.projectDir}
            >
              {project.name} · {project.buildSystem.toUpperCase()}
            </span>
          </div>
        )}

        <div className="topbar-right">
          {project && (
            <>
              <button className="btn btn-primary btn-sm" onClick={handleApplyFiles}>
                <Save size={13} /> 生成配置
              </button>
              <button
                className="btn btn-sm"
                disabled={isRunning}
                onClick={() => handleRunAction('build')}
              >
                <Hammer size={13} color="#60a5fa" /> 编译
              </button>
              <button
                className="btn btn-sm"
                disabled={isRunning}
                onClick={() => handleRunAction('clean')}
              >
                <Trash size={13} /> 清理
              </button>
              <button
                className="btn btn-success btn-sm"
                disabled={isRunning}
                onClick={() => handleRunAction('flash')}
              >
                <Play size={13} /> 烧录
              </button>
              <button className="btn btn-sm" onClick={handleOpenVscode} title="一键在 VSCode 中打开当前程序">
                <ExternalLink size={13} /> VSCode
              </button>
            </>
          )}
        </div>
      </header>

      {/* Multi-Program Tabs Bar (for IAP / Bootloader + App / Multi-target workspaces) */}
      {workspace && project && (
        <ProgramTabsBar
          programs={workspace.programs}
          activeIndex={workspace.activeIndex}
          isRunning={isRunning}
          onSelect={(idx) => setWorkspace({ ...workspace, activeIndex: idx })}
          onCloseTab={handleCloseProgramTab}
          onImportSubProgram={handleImportSubProgram}
          onCreateSegment={handleCreateProgramSegment}
          onBuildAll={handleBuildAll}
          onMergeFirmware={handleMergeFirmware}
        />
      )}

      {/* Main Content */}
      {!project ? (
        <WelcomeView
          env={env}
          recentProjects={recentProjects}
          onImportClick={handleImportClick}
          onImportKeilClick={handleImportKeilClick}
          onImportPath={handleImportPath}
          onNewClick={() => setShowNewModal(true)}
        />
      ) : (
        <div className="workspace-body">
          <ProjectTree config={project} onChange={updateActiveProject} onNotify={showToast} />

          <div className="main-column">
            <div className="tabs-bar">
              <button
                className={`tab-btn ${activeTab === 'target' ? 'active' : ''}`}
                onClick={() => setActiveTab('target')}
              >
                <Sliders size={14} /> 目标与编译选项
              </button>
              <button
                className={`tab-btn ${activeTab === 'toolchain' ? 'active' : ''}`}
                onClick={() => setActiveTab('toolchain')}
              >
                <Wrench size={14} /> 工具链与调试烧录器
              </button>
              <button
                className={`tab-btn ${activeTab === 'ide' ? 'active' : ''}`}
                onClick={() => setActiveTab('ide')}
              >
                <Sparkles size={14} /> VSCode / Vim / clangd
              </button>
              <button
                className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                <FileCode size={14} /> 文件预览与写入
              </button>
              <button
                className={`tab-btn ${activeTab === 'memory' ? 'active' : ''}`}
                onClick={() => setActiveTab('memory')}
              >
                <BarChart3 size={14} /> 固件体积分析
              </button>
            </div>

            <div className="content-scroll">
              {activeTab === 'target' && (
                <TargetConfigPanel config={project} onChange={updateActiveProject} />
              )}
              {activeTab === 'toolchain' && (
                <ToolchainPanel
                  config={project}
                  env={env}
                  onChange={updateActiveProject}
                  onRedetectEnv={async () => {
                    await refreshEnv();
                    showToast('已刷新本机工具链探测结果');
                  }}
                  onNotify={showToast}
                />
              )}
              {activeTab === 'ide' && (
                <IdeConfigPanel
                  config={project}
                  onChange={updateActiveProject}
                  onApply={handleApplyFiles}
                  onOpenVscode={handleOpenVscode}
                />
              )}
              {activeTab === 'preview' && (
                <PreviewPanel config={project} onApply={handleApplyFiles} />
              )}
              {activeTab === 'memory' && <MemoryAnalysisPanel config={project} />}
            </div>

            <ConsolePanel
              projectDir={project.projectDir}
              logs={logs}
              isRunning={isRunning}
              memoryUsage={memoryUsage}
              onClear={() => setLogs([])}
              onStop={() => window.mcuForge.stopAction()}
              onOpenLocation={handleOpenLocation}
            />
          </div>
        </div>
      )}

      {showNewModal && (
        <NewProjectModal onClose={() => setShowNewModal(false)} onCreate={handleCreateWorkspace} />
      )}

      {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
