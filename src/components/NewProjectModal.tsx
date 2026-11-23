import React, { useState } from 'react';
import { FolderOpen, Layers, Plus, Trash2, X } from 'lucide-react';
import {
  BuildSystem,
  DebuggerType,
  NewProgramSegment,
  NewWorkspaceOptions,
  ProjectKind,
} from '../types/api';

interface NewProjectModalProps {
  onClose: () => void;
  onCreate: (opts: NewWorkspaceOptions) => void;
}

const CPU_PRESETS: Record<ProjectKind, string> = {
  stm32: '-mcpu=cortex-m3 -mthumb -mfloat-abi=soft',
  'arm-generic': '-mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard',
  riscv: '-march=rv32imac -mabi=ilp32',
  'custom-mcu': '',
  'generic-c': '',
};

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ onClose, onCreate }) => {
  const [workspaceName, setWorkspaceName] = useState('my_mcu_project');
  const [parentDir, setParentDir] = useState('');
  const [projectKind, setProjectKind] = useState<ProjectKind>('stm32');
  const [buildSystem, setBuildSystem] = useState<BuildSystem>('makefile');
  const [cpuFlags, setCpuFlags] = useState(CPU_PRESETS.stm32);
  const [debuggerType, setDebuggerType] = useState<DebuggerType>('openocd');
  const [createStarterFiles, setCreateStarterFiles] = useState(true);
  const [segments, setSegments] = useState<NewProgramSegment[]>([
    { name: 'app', subDir: '', flashOrigin: '0x08000000', flashLength: '512K' },
  ]);

  const handleKindChange = (kind: ProjectKind) => {
    setProjectKind(kind);
    setCpuFlags(CPU_PRESETS[kind]);
    if (kind === 'generic-c') {
      setDebuggerType('gdb-host');
      setSegments((prev) => prev.map((s) => ({ ...s, flashOrigin: '', flashLength: '' })));
    } else if (kind === 'custom-mcu') {
      setDebuggerType('none');
    } else {
      setDebuggerType('openocd');
    }
  };

  const pickParentDir = async () => {
    const dir = await window.mcuForge.selectDir('选择工程父目录');
    if (dir) setParentDir(dir);
  };

  const addSegment = () => {
    setSegments((prev) => {
      const nextIdx = prev.length + 1;
      const defaultOrigin = prev.length === 1 ? '0x08008000' : `0x080${(nextIdx * 2).toString(16)}0000`;
      // When transitioning from 1 to 2+ segments, auto-fill subDir for the first segment too
      const normalized = prev.map((s, idx) => ({
        ...s,
        subDir: s.subDir || s.name || `prog_${idx + 1}`,
      }));
      return [
        ...normalized,
        {
          name: prev.length === 1 ? 'app_main' : `app_${nextIdx}`,
          subDir: prev.length === 1 ? 'app_main' : `app_${nextIdx}`,
          flashOrigin: projectKind === 'generic-c' ? '' : defaultOrigin,
          flashLength: projectKind === 'generic-c' ? '' : '256K',
        },
      ];
    });
  };

  const applyIapPreset = () => {
    setSegments([
      { name: 'bootloader', subDir: 'bootloader', flashOrigin: '0x08000000', flashLength: '32K' },
      { name: 'app', subDir: 'app', flashOrigin: '0x08008000', flashLength: '480K' },
    ]);
  };

  const updateSegment = (idx: number, patch: Partial<NewProgramSegment>) => {
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeSegment = (idx: number) => {
    if (segments.length <= 1) return;
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim() || !parentDir.trim()) return;
    onCreate({
      workspaceName: workspaceName.trim(),
      parentDir: parentDir.trim(),
      projectKind,
      buildSystem,
      cpuFlags,
      debuggerType,
      createStarterFiles,
      segments: segments.map((s, idx) => ({
        ...s,
        name: s.name.trim() || (segments.length === 1 ? workspaceName.trim() : `prog_${idx + 1}`),
      })),
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" style={{ width: 660, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="card-header">
          <div>
            <div className="card-title">新建 Makefile / CMake 工程（支持单工程多程序段）</div>
            <div className="card-desc">
              支持 STM32、非 STM32 或纯 C 工程；可点击 + 增加多个程序段（如 IAP Bootloader + App）并指定 Flash 起始地址。
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid-2">
            <div className="field">
              <label>工作区文件夹名 *</label>
              <input
                className="input mono"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="例如: sensor_iap_suite"
                required
              />
            </div>

            <div className="field">
              <label>构建系统</label>
              <select
                className="select"
                value={buildSystem}
                onChange={(e) => setBuildSystem(e.target.value as BuildSystem)}
              >
                <option value="makefile">GNU Makefile</option>
                <option value="cmake">CMake (CMakeLists.txt)</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>存放位置（父目录）*</label>
            <div className="input-row">
              <input
                className="input mono"
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="选择或输入目录路径"
                required
              />
              <button type="button" className="btn" onClick={pickParentDir}>
                <FolderOpen size={14} /> 浏览
              </button>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>工程类型</label>
              <select
                className="select"
                value={projectKind}
                onChange={(e) => handleKindChange(e.target.value as ProjectKind)}
              >
                <option value="stm32">STM32 (ARM Cortex-M)</option>
                <option value="arm-generic">通用 ARM Cortex-M MCU</option>
                <option value="riscv">RISC-V MCU (ESP32-C / GD32V / CH32V)</option>
                <option value="custom-mcu">自定义 / 小众 MCU（可手动导入编译器）</option>
                <option value="generic-c">通用主机端纯 C / C++ 工程</option>
              </select>
            </div>

            <div className="field">
              <label>调试 / 烧录器（可选）</label>
              <select
                className="select"
                value={debuggerType}
                onChange={(e) => setDebuggerType(e.target.value as DebuggerType)}
              >
                <option value="none">暂不选择（仅编译 / 后续配置）</option>
                <option value="openocd">OpenOCD (ST-Link / CMSIS-DAP / J-Link)</option>
                <option value="jlink">SEGGER J-Link</option>
                <option value="stlink">ST-Link (st-flash / st-util)</option>
                <option value="pyocd">PyOCD (CMSIS-DAP)</option>
                <option value="gdb-host">本机 GDB（纯 C/C++ 程序调试）</option>
                <option value="custom">自定义烧录器命令</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>CPU / 架构编译标志（可选，纯 C 可留空）</label>
            <input
              className="input mono"
              value={cpuFlags}
              onChange={(e) => setCpuFlags(e.target.value)}
              placeholder="例如: -mcpu=cortex-m4 -mthumb"
            />
          </div>

          {/* Multi-program Segments Section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
                <Layers size={14} color="#60a5fa" />
                程序段配置 ({segments.length} 个程序)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {projectKind !== 'generic-c' && (
                  <button type="button" className="btn btn-sm" onClick={applyIapPreset}>
                    IAP 双程序预设 (Boot + App)
                  </button>
                )}
                <button type="button" className="btn btn-sm btn-primary" onClick={addSegment}>
                  <Plus size={12} /> 增加程序段
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {segments.map((seg, idx) => (
                <div key={idx} className="segment-row">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11.5, color: '#93c5fd', fontWeight: 600 }}>
                      程序段 #{idx + 1} {segments.length > 1 ? `(${seg.subDir || seg.name}/)` : '(工程根目录)'}
                    </span>
                    {segments.length > 1 && (
                      <button
                        type="button"
                        className="btn-icon"
                        title="删除此程序段"
                        onClick={() => removeSegment(idx)}
                      >
                        <Trash2 size={13} color="#f87171" />
                      </button>
                    )}
                  </div>

                  <div className="grid-3">
                    <div className="field">
                      <label>程序名 (TARGET)</label>
                      <input
                        className="input mono"
                        value={seg.name}
                        onChange={(e) =>
                          updateSegment(idx, {
                            name: e.target.value,
                            subDir: segments.length > 1 ? e.target.value : '',
                          })
                        }
                        placeholder="如 bootloader / app"
                      />
                    </div>
                    <div className="field">
                      <label>Flash 起始地址（可选）</label>
                      <input
                        className="input mono"
                        value={seg.flashOrigin}
                        onChange={(e) => updateSegment(idx, { flashOrigin: e.target.value })}
                        placeholder="如 0x08000000"
                      />
                    </div>
                    <div className="field">
                      <label>Flash 大小（可选）</label>
                      <input
                        className="input mono"
                        value={seg.flashLength}
                        onChange={(e) => updateSegment(idx, { flashLength: e.target.value })}
                        placeholder="如 32K / 480K"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={createStarterFiles}
              onChange={(e) => setCreateStarterFiles(e.target.checked)}
            />
            为每个程序段自动创建基础模板源码（src/main.c + inc/app.h）
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!workspaceName.trim() || !parentDir.trim()}
            >
              创建并打开工程
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
