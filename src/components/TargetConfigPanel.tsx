import React, { useState } from 'react';
import { Cpu, FileSearch, FolderPlus, Package, Plus, Sliders, Terminal, X } from 'lucide-react';
import { BuildSystem, McuProjectConfig, OptimizationLevel, ProjectKind } from '../types/api';

interface TargetConfigPanelProps {
  config: McuProjectConfig;
  onChange: (next: McuProjectConfig) => void;
}

const ARCH_QUICK_PRESETS = [
  { label: 'Cortex-M0/M0+', flags: '-mcpu=cortex-m0 -mthumb -mfloat-abi=soft' },
  { label: 'Cortex-M3 (STM32F1)', flags: '-mcpu=cortex-m3 -mthumb -mfloat-abi=soft' },
  { label: 'Cortex-M4F (STM32F4/G4)', flags: '-mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard' },
  { label: 'Cortex-M7F (STM32H7)', flags: '-mcpu=cortex-m7 -mthumb -mfpu=fpv5-d16 -mfloat-abi=hard' },
  { label: 'RISC-V RV32IMAC', flags: '-march=rv32imac -mabi=ilp32' },
  { label: '主机纯 C (留空)', flags: '' },
];

export const TargetConfigPanel: React.FC<TargetConfigPanelProps> = ({ config, onChange }) => {
  const [newDef, setNewDef] = useState('');

  const addDefine = () => {
    const clean = newDef.trim().replace(/^-D/, '');
    if (!clean) return;
    if (!config.defines.includes(clean)) {
      onChange({ ...config, defines: [...config.defines, clean] });
    }
    setNewDef('');
  };

  const removeDefine = (d: string) => {
    onChange({ ...config, defines: config.defines.filter((x) => x !== d) });
  };

  const pickLinkerScript = async () => {
    const picked = await window.mcuForge.selectFiles({
      title: '选择链接脚本 (.ld / .lds)',
      defaultPath: config.projectDir,
      filters: [{ name: 'Linker Script', extensions: ['ld', 'lds'] }],
    });
    if (!picked.length) return;
    const [rel] = await window.mcuForge.toRelative(config.projectDir, picked);
    onChange({ ...config, linkerScript: rel });
  };

  const updateFlags = (patch: Partial<McuProjectConfig['flags']>) => {
    onChange({ ...config, flags: { ...config.flags, ...patch } });
  };

  const addStaticLib = async () => {
    const picked = await window.mcuForge.selectFiles({
      title: '选择第三方静态库文件 (.a / .lib)',
      multi: true,
      defaultPath: config.projectDir,
      filters: [{ name: 'Static Libraries', extensions: ['a', 'lib'] }],
    });
    if (!picked.length) return;
    const rels = await window.mcuForge.toRelative(config.projectDir, picked);
    onChange({
      ...config,
      staticLibs: Array.from(new Set([...(config.staticLibs || []), ...rels])),
    });
  };

  const addLibSearchDir = async () => {
    const dir = await window.mcuForge.selectDir('选择库文件搜索目录 (-L)');
    if (!dir) return;
    const [rel] = await window.mcuForge.toRelative(config.projectDir, [dir]);
    onChange({
      ...config,
      libSearchDirs: Array.from(new Set([...(config.libSearchDirs || []), rel])),
    });
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">
              <Cpu size={16} color="#60a5fa" />
              工程基础与芯片目标（类 Keil Target 选项）
            </div>
            <div className="card-desc">配置目标名称、构建引擎、架构标志及链接脚本（纯 C 工程可留空链接脚本）。</div>
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>目标名称 (TARGET)</label>
            <input
              className="input mono"
              value={config.name}
              onChange={(e) => onChange({ ...config, name: e.target.value })}
            />
          </div>

          <div className="field">
            <label>构建系统</label>
            <select
              className="select"
              value={config.buildSystem}
              onChange={(e) => onChange({ ...config, buildSystem: e.target.value as BuildSystem })}
            >
              <option value="makefile">GNU Makefile</option>
              <option value="cmake">CMake (CMakeLists.txt)</option>
            </select>
          </div>

          <div className="field">
            <label>工程类型</label>
            <select
              className="select"
              value={config.projectKind}
              onChange={(e) => onChange({ ...config, projectKind: e.target.value as ProjectKind })}
            >
              <option value="stm32">STM32 (Cortex-M)</option>
              <option value="arm-generic">通用 ARM MCU</option>
              <option value="riscv">RISC-V MCU</option>
              <option value="custom-mcu">自定义 / 小众 MCU</option>
              <option value="generic-c">通用主机端纯 C/C++</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label>CPU / FPU / 架构编译标志</label>
          <input
            className="input mono"
            value={config.flags.cpuFlags}
            onChange={(e) => updateFlags({ cpuFlags: e.target.value })}
            placeholder="-mcpu=cortex-m3 -mthumb -mfloat-abi=soft"
          />
          <div className="chip-list">
            {ARCH_QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn btn-sm"
                onClick={() => updateFlags({ cpuFlags: p.flags })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>链接脚本 (LDSCRIPT，纯 C 可留空)</label>
            <div className="input-row">
              <input
                className="input mono"
                value={config.linkerScript}
                onChange={(e) => onChange({ ...config, linkerScript: e.target.value })}
                placeholder="例如: STM32F103RE_FLASH.ld"
              />
              <button className="btn" onClick={pickLinkerScript}>
                <FileSearch size={14} /> 选择
              </button>
            </div>
          </div>

          <div className="field">
            <label>输出构建目录 (BUILD_DIR)</label>
            <input
              className="input mono"
              value={config.buildDir}
              onChange={(e) => onChange({ ...config, buildDir: e.target.value })}
              placeholder="build"
            />
          </div>
        </div>

        {/* Memory Layout (IAP Flash Origin / Length) */}
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Flash 起始地址（IAP / 烧录基址，可选）</label>
            <input
              className="input mono"
              value={config.memoryLayout?.flashOrigin || ''}
              onChange={(e) =>
                onChange({
                  ...config,
                  memoryLayout: {
                    flashOrigin: e.target.value,
                    flashLength: config.memoryLayout?.flashLength || '',
                    ramOrigin: config.memoryLayout?.ramOrigin || '0x20000000',
                    ramLength: config.memoryLayout?.ramLength || '',
                  },
                })
              }
              placeholder="如 0x08000000 或 0x08008000"
            />
          </div>
          <div className="field">
            <label>Flash 分区大小（可选）</label>
            <input
              className="input mono"
              value={config.memoryLayout?.flashLength || ''}
              onChange={(e) =>
                onChange({
                  ...config,
                  memoryLayout: {
                    flashOrigin: config.memoryLayout?.flashOrigin || '0x08000000',
                    flashLength: e.target.value,
                    ramOrigin: config.memoryLayout?.ramOrigin || '0x20000000',
                    ramLength: config.memoryLayout?.ramLength || '',
                  },
                })
              }
              placeholder="如 32K / 480K / 512K"
            />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <label className="checkbox-row" style={{ paddingBottom: 6 }}>
              <input
                type="checkbox"
                checked={!!config.protectExistingBuildFile}
                onChange={(e) => onChange({ ...config, protectExistingBuildFile: e.target.checked })}
              />
              锁定原 Makefile/CMake（仅生成 IDE 配置）
            </label>
          </div>
        </div>
      </div>

      {/* Preprocessor Defines */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 10 }}>
          <div className="card-title">预处理宏定义 (C_DEFS / -D)</div>
        </div>
        <div className="input-row">
          <input
            className="input mono"
            value={newDef}
            onChange={(e) => setNewDef(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDefine()}
            placeholder="输入宏定义后按回车，如: USE_HAL_DRIVER 或 STM32F103xE"
          />
          <button className="btn btn-primary" onClick={addDefine}>
            <Plus size={14} /> 添加
          </button>
        </div>
        <div className="chip-list">
          {config.defines.map((d) => (
            <span key={d} className="chip">
              -D{d}
              <button onClick={() => removeDefine(d)} title="移除">
                <X size={12} />
              </button>
            </span>
          ))}
          {config.defines.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无宏定义</span>
          )}
        </div>
      </div>

      {/* Compiler & Linker Flags */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Sliders size={16} color="#a78bfa" />
            编译与链接参数 (C/C++ &amp; Linker)
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>优化等级</label>
            <select
              className="select mono"
              value={config.flags.optimization}
              onChange={(e) => updateFlags({ optimization: e.target.value as OptimizationLevel })}
            >
              <option value="-O0">-O0 (无优化 / 最佳调试体验)</option>
              <option value="-Og">-Og (调试友好优化)</option>
              <option value="-O1">-O1 (轻度优化)</option>
              <option value="-O2">-O2 (推荐平衡优化)</option>
              <option value="-O3">-O3 (最高性能优化)</option>
              <option value="-Os">-Os (代码体积最小化)</option>
            </select>
          </div>

          <div className="field">
            <label>C 语言标准</label>
            <select
              className="select mono"
              value={config.flags.cStandard}
              onChange={(e) => updateFlags({ cStandard: e.target.value })}
            >
              <option value="gnu11">gnu11</option>
              <option value="c11">c11</option>
              <option value="gnu99">gnu99</option>
              <option value="c99">c99</option>
              <option value="gnu17">gnu17</option>
            </select>
          </div>

          <div className="field">
            <label>并行编译线程数 (JOBS)</label>
            <input
              type="number"
              min={1}
              max={64}
              className="input mono"
              value={config.flags.parallelJobs}
              onChange={(e) => updateFlags({ parallelJobs: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>额外 CFLAGS</label>
            <input
              className="input mono"
              value={config.flags.extraCFlags}
              onChange={(e) => updateFlags({ extraCFlags: e.target.value })}
            />
          </div>
          <div className="field">
            <label>额外 LDFLAGS</label>
            <input
              className="input mono"
              value={config.flags.extraLdFlags}
              onChange={(e) => updateFlags({ extraLdFlags: e.target.value })}
            />
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="field">
            <label>链接库 (LIBS)</label>
            <input
              className="input mono"
              value={config.flags.libs}
              onChange={(e) => updateFlags({ libs: e.target.value })}
            />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 16, paddingBottom: 6 }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.flags.generateHex}
                  onChange={(e) => updateFlags({ generateHex: e.target.checked })}
                />
                生成 .hex
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.flags.generateBin}
                  onChange={(e) => updateFlags({ generateBin: e.target.checked })}
                />
                生成 .bin
              </label>
              <label className="checkbox-row" title="将本机 GCC_PATH / OPENOCD 抽离至 local.mk（可加入 .gitignore），便于 Win/Mac/Linux 三端协同">
                <input
                  type="checkbox"
                  checked={!!config.useLocalMk}
                  onChange={(e) => onChange({ ...config, useLocalMk: e.target.checked })}
                />
                三端解耦 (local.mk)
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Static Libraries (.a) & Library Search Dirs (-L) */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 10 }}>
          <div>
            <div className="card-title">
              <Package size={16} color="#34d399" />
              第三方静态库 (.a) 与库搜索目录 (-L)
            </div>
            <div className="card-desc">用于链接 CMSIS-DSP、电机/加密/私有厂商协议栈等预编译静态库。</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={addLibSearchDir}>
              <FolderPlus size={13} /> 添加库目录 (-L)
            </button>
            <button className="btn btn-sm btn-primary" onClick={addStaticLib}>
              <Plus size={13} /> 导入 .a 静态库
            </button>
          </div>
        </div>

        <div className="grid-2">
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>静态库文件：</div>
            <div className="chip-list">
              {(config.staticLibs || []).map((lib) => (
                <span key={lib} className="chip">
                  {lib}
                  <button
                    onClick={() =>
                      onChange({
                        ...config,
                        staticLibs: (config.staticLibs || []).filter((x) => x !== lib),
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {(config.staticLibs || []).length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无静态库</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>库搜索路径 (-L)：</div>
            <div className="chip-list">
              {(config.libSearchDirs || []).map((dir) => (
                <span key={dir} className="chip">
                  -L{dir}
                  <button
                    onClick={() =>
                      onChange({
                        ...config,
                        libSearchDirs: (config.libSearchDirs || []).filter((x) => x !== dir),
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              {(config.libSearchDirs || []).length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无库路径</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pre-build / Post-build Hooks (Keil User tab equivalent) */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 10 }}>
          <div>
            <div className="card-title">
              <Terminal size={16} color="#fbbf24" />
              编译前后自定义命令（类 Keil User 选项卡）
            </div>
            <div className="card-desc">
              常用于在编译前生成版本头文件，或编译后调用脚本给固件加 CRC 校验头 / IAP 打包。
            </div>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Pre-build 编译前执行命令（可选）</label>
            <input
              className="input mono"
              value={config.hooks?.preBuild || ''}
              onChange={(e) =>
                onChange({
                  ...config,
                  hooks: { preBuild: e.target.value, postBuild: config.hooks?.postBuild || '' },
                })
              }
              placeholder="例如: python tools/gen_version.py"
            />
          </div>
          <div className="field">
            <label>Post-build 编译后执行命令（可选）</label>
            <input
              className="input mono"
              value={config.hooks?.postBuild || ''}
              onChange={(e) =>
                onChange({
                  ...config,
                  hooks: { preBuild: config.hooks?.preBuild || '', postBuild: e.target.value },
                })
              }
              placeholder="例如: python tools/pack_ota.py build/app.bin"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
