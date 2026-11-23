import React from 'react';
import { Bug, FolderOpen, RefreshCw, Wrench, FileSearch } from 'lucide-react';
import { DebuggerType, EnvironmentReport, McuProjectConfig } from '../types/api';

interface ToolchainPanelProps {
  config: McuProjectConfig;
  env: EnvironmentReport | null;
  onChange: (next: McuProjectConfig) => void;
  onRedetectEnv: () => void;
  onNotify: (msg: string) => void;
}

const OPENOCD_INTERFACE_PRESETS = [
  'interface/stlink.cfg',
  'interface/cmsis-dap.cfg',
  'interface/jlink.cfg',
  'interface/ftdi/jtag-lock-pick_tiny_2.cfg',
];

const OPENOCD_TARGET_PRESETS = [
  'target/stm32f1x.cfg',
  'target/stm32f4x.cfg',
  'target/stm32g4x.cfg',
  'target/stm32h7x.cfg',
  'target/stm32l4x.cfg',
  'target/gd32vf103.cfg',
  'target/nrf52.cfg',
  'target/rp2040.cfg',
];

export const ToolchainPanel: React.FC<ToolchainPanelProps> = ({
  config,
  env,
  onChange,
  onRedetectEnv,
  onNotify,
}) => {
  const tc = config.toolchain;
  const dbg = config.debugger;

  const updateTc = (patch: Partial<McuProjectConfig['toolchain']>) => {
    onChange({ ...config, toolchain: { ...tc, ...patch } });
  };

  const updateDbg = (patch: Partial<McuProjectConfig['debugger']>) => {
    onChange({ ...config, debugger: { ...dbg, ...patch } });
  };

  const pickCompilerDir = async () => {
    const dir = await window.mcuForge.selectDir('选择编译器 bin 目录（如 arm-none-eabi/bin）');
    if (dir) updateTc({ compilerDir: dir.replace(/\\/g, '/') });
  };

  const pickExecutable = async (title: string, onPick: (p: string) => void) => {
    const files = await window.mcuForge.selectFiles({ title, multi: false });
    if (files.length > 0) onPick(files[0].replace(/\\/g, '/'));
  };

  const pickSvd = async () => {
    const files = await window.mcuForge.selectFiles({
      title: '选择芯片 SVD 文件（用于 VSCode 外设寄存器视图）',
      defaultPath: config.projectDir,
      filters: [{ name: 'SVD Files', extensions: ['svd'] }],
    });
    if (!files.length) return;
    const [rel] = await window.mcuForge.toRelative(config.projectDir, files);
    updateDbg({ svdFile: rel });
  };

  const detectedCompilers = env?.tools.filter((t) => t.category === 'compiler') ?? [];
  const detectedDebuggers = env?.tools.filter((t) => t.category === 'debugger') ?? [];

  return (
    <div>
      {/* Compiler Toolchain Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Wrench size={16} color="#60a5fa" />
              编译器与构建工具链（支持导入自定义/私有 MCU 编译器）
            </div>
            <div className="card-desc">
              若本机未将编译器加入 PATH，或使用非开源/小众厂商自定义编译器，可直接浏览导入路径。
            </div>
          </div>
          <button className="btn btn-sm" onClick={onRedetectEnv}>
            <RefreshCw size={13} /> 重新探测本机工具
          </button>
        </div>

        {detectedCompilers.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
              本机已探测到的编译器（点击一键填入）：
            </div>
            <div className="chip-list">
              {detectedCompilers.map((tool) => (
                <button
                  key={tool.path}
                  className="btn btn-sm"
                  title={tool.path}
                  onClick={() => {
                    updateTc({
                      compilerDir: tool.dir,
                      prefix: tool.prefix ?? '',
                      ccExecutable: tool.prefix ? '' : tool.path,
                    });
                    onNotify(`已选择编译器: ${tool.name}`);
                  }}
                >
                  {tool.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>编译器目录 (GCC_PATH / bin 目录)</label>
            <div className="input-row">
              <input
                className="input mono"
                value={tc.compilerDir}
                onChange={(e) => updateTc({ compilerDir: e.target.value })}
                placeholder="留空则使用系统 PATH，或导入 bin 目录"
              />
              <button className="btn" onClick={pickCompilerDir}>
                <FolderOpen size={14} /> 导入
              </button>
            </div>
          </div>

          <div className="field">
            <label>工具链前缀 (PREFIX)</label>
            <input
              className="input mono"
              value={tc.prefix}
              onChange={(e) => updateTc({ prefix: e.target.value })}
              placeholder="如 arm-none-eabi- / riscv-none-elf- / 留空"
            />
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>自定义 C 编译器可执行文件（覆盖默认 PREFIX+gcc，适合小众 MCU）</label>
            <div className="input-row">
              <input
                className="input mono"
                value={tc.ccExecutable}
                onChange={(e) => updateTc({ ccExecutable: e.target.value })}
                placeholder="可选：直接指定自定义编译器路径"
              />
              <button
                className="btn"
                onClick={() => pickExecutable('选择自定义 C 编译器', (p) => updateTc({ ccExecutable: p }))}
              >
                <FileSearch size={14} /> 导入
              </button>
            </div>
          </div>

          <div className="field">
            <label>自定义 GDB 调试器路径（可选，默认 PREFIX+gdb）</label>
            <div className="input-row">
              <input
                className="input mono"
                value={tc.gdbExecutable}
                onChange={(e) => updateTc({ gdbExecutable: e.target.value })}
                placeholder="可选：指定 arm-none-eabi-gdb / gdb 路径"
              />
              <button
                className="btn"
                onClick={() => pickExecutable('选择 GDB 可执行文件', (p) => updateTc({ gdbExecutable: p }))}
              >
                <FileSearch size={14} /> 导入
              </button>
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Make 路径</label>
            <div className="input-row">
              <input
                className="input mono"
                value={tc.makeExecutable}
                onChange={(e) => updateTc({ makeExecutable: e.target.value })}
                placeholder="make"
              />
              <button
                className="btn"
                onClick={() => pickExecutable('选择 Make 可执行文件', (p) => updateTc({ makeExecutable: p }))}
              >
                <FileSearch size={14} /> 导入
              </button>
            </div>
          </div>

          <div className="field">
            <label>CMake 路径</label>
            <div className="input-row">
              <input
                className="input mono"
                value={tc.cmakeExecutable}
                onChange={(e) => updateTc({ cmakeExecutable: e.target.value })}
                placeholder="cmake"
              />
              <button
                className="btn"
                onClick={() => pickExecutable('选择 CMake 可执行文件', (p) => updateTc({ cmakeExecutable: p }))}
              >
                <FileSearch size={14} /> 导入
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Debugger & Flasher Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Bug size={16} color="#a78bfa" />
              烧录器与在线调试器配置（类 Keil Debug 选项卡）
            </div>
            <div className="card-desc">
              选择下载/调试后端，将同步生成 Makefile flash/debug 目标与 VSCode launch.json。
            </div>
          </div>
        </div>

        {detectedDebuggers.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
              本机已探测到的烧录/调试工具（点击一键填入）：
            </div>
            <div className="chip-list">
              {detectedDebuggers.map((tool) => (
                <button
                  key={tool.path}
                  className="btn btn-sm"
                  title={tool.path}
                  onClick={() => {
                    const lower = tool.name.toLowerCase();
                    const type: DebuggerType = lower.includes('openocd')
                      ? 'openocd'
                      : lower.includes('j-link')
                        ? 'jlink'
                        : lower.includes('st-link')
                          ? 'stlink'
                          : lower.includes('pyocd')
                            ? 'pyocd'
                            : 'custom';
                    updateDbg({ type, serverPath: tool.path });
                    onNotify(`已填入调试工具: ${tool.name}`);
                  }}
                >
                  {tool.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>调试 / 烧录后端</label>
            <select
              className="select"
              value={dbg.type}
              onChange={(e) => updateDbg({ type: e.target.value as DebuggerType })}
            >
              <option value="none">不配置（仅编译）</option>
              <option value="openocd">OpenOCD (ST-Link / CMSIS-DAP / J-Link)</option>
              <option value="jlink">SEGGER J-Link</option>
              <option value="stlink">ST-Link (st-flash / st-util)</option>
              <option value="pyocd">PyOCD</option>
              <option value="gdb-host">本机 GDB（纯 C/C++ 程序）</option>
              <option value="custom">自定义烧录器命令（支持小众 MCU）</option>
            </select>
          </div>

          <div className="field">
            <label>烧录 / 调试器可执行文件路径</label>
            <div className="input-row">
              <input
                className="input mono"
                value={dbg.serverPath}
                onChange={(e) => updateDbg({ serverPath: e.target.value })}
                placeholder="例如: openocd / JLinkGDBServer / 自定义烧录器"
              />
              <button
                className="btn"
                onClick={() => pickExecutable('导入烧录器 / 调试器程序', (p) => updateDbg({ serverPath: p }))}
              >
                <FileSearch size={14} /> 导入
              </button>
            </div>
          </div>
        </div>

        {dbg.type === 'openocd' && (
          <>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div className="field">
                <label>OpenOCD Interface 配置</label>
                <input
                  className="input mono"
                  value={dbg.openocdInterface}
                  onChange={(e) => updateDbg({ openocdInterface: e.target.value })}
                  list="openocd-if-presets"
                />
                <datalist id="openocd-if-presets">
                  {OPENOCD_INTERFACE_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div className="field">
                <label>OpenOCD Target 芯片配置</label>
                <input
                  className="input mono"
                  value={dbg.openocdTarget}
                  onChange={(e) => updateDbg({ openocdTarget: e.target.value })}
                  list="openocd-tgt-presets"
                />
                <datalist id="openocd-tgt-presets">
                  {OPENOCD_TARGET_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 12 }}>
              <label>OpenOCD Scripts 目录（可选）</label>
              <div className="input-row">
                <input
                  className="input mono"
                  value={dbg.openocdScriptsDir}
                  onChange={(e) => updateDbg({ openocdScriptsDir: e.target.value })}
                  placeholder="例如: E:/OpenOCD/share/openocd/scripts"
                />
                <button
                  className="btn"
                  onClick={async () => {
                    const dir = await window.mcuForge.selectDir('选择 OpenOCD scripts 目录');
                    if (dir) updateDbg({ openocdScriptsDir: dir.replace(/\\/g, '/') });
                  }}
                >
                  <FolderOpen size={14} /> 选择
                </button>
              </div>
            </div>
          </>
        )}

        {(dbg.type === 'jlink' || dbg.type === 'pyocd') && (
          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>目标芯片型号 (Device / Target ID)</label>
              <input
                className="input mono"
                value={dbg.deviceName}
                onChange={(e) => updateDbg({ deviceName: e.target.value })}
                placeholder="例如: STM32F103RE / STM32F407VG"
              />
            </div>
            <div className="field">
              <label>调试接口模式</label>
              <select
                className="select"
                value={dbg.interfaceMode}
                onChange={(e) => updateDbg({ interfaceMode: e.target.value as 'swd' | 'jtag' })}
              >
                <option value="swd">SWD</option>
                <option value="jtag">JTAG</option>
              </select>
            </div>
          </div>
        )}

        {dbg.type === 'custom' && (
          <div className="field" style={{ marginBottom: 12 }}>
            <label>自定义烧录命令模板（可用变量：${'{ELF}'}, ${'{HEX}'}, ${'{BIN}'}, ${'{TARGET}'}）</label>
            <input
              className="input mono"
              value={dbg.customFlashCommand}
              onChange={(e) => updateDbg({ customFlashCommand: e.target.value })}
              placeholder='例如: my_flasher --port COM3 --write "${BIN}"'
            />
          </div>
        )}

        {dbg.type !== 'none' && dbg.type !== 'gdb-host' && (
          <div className="field">
            <label>SVD 外设寄存器描述文件（可选，供 VSCode Cortex-Debug 查看寄存器）</label>
            <div className="input-row">
              <input
                className="input mono"
                value={dbg.svdFile}
                onChange={(e) => updateDbg({ svdFile: e.target.value })}
                placeholder="可选：选择芯片 .svd 文件"
              />
              <button className="btn" onClick={pickSvd}>
                <FileSearch size={14} /> 选择
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
