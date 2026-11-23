import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  FileCode2,
  Folder,
  FolderPlus,
  FilePlus2,
  Trash2,
  ScanSearch,
  FileText,
  Layers,
  Search,
  X,
} from 'lucide-react';
import { McuProjectConfig } from '../types/api';

interface ProjectTreeProps {
  config: McuProjectConfig;
  onChange: (next: McuProjectConfig) => void;
  onNotify: (msg: string) => void;
}

type TreeTab = 'sources' | 'headers';

export const ProjectTree: React.FC<ProjectTreeProps> = ({ config, onChange, onNotify }) => {
  const [treeTab, setTreeTab] = useState<TreeTab>('sources');
  /** Track expanded group IDs; empty object = ALL groups collapsed by default! */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [asmExpanded, setAsmExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Reset collapse state when switching to a different program tab
  useEffect(() => {
    setExpanded({});
    setAsmExpanded(false);
    setSearchQuery('');
  }, [config.projectDir]);

  const query = searchQuery.trim().toLowerCase();

  const totalSources = config.sourceGroups.reduce((acc, g) => acc + g.files.length, 0);

  const toggleGroup = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of config.sourceGroups) next[g.id] = true;
    setExpanded(next);
    setAsmExpanded(true);
  };

  const collapseAll = () => {
    setExpanded({});
    setAsmExpanded(false);
  };

  const filteredGroups = useMemo(() => {
    if (!query) return config.sourceGroups;
    return config.sourceGroups
      .map((grp) => {
        const groupMatches = grp.name.toLowerCase().includes(query);
        const matchedFiles = groupMatches
          ? grp.files
          : grp.files.filter((f) => f.toLowerCase().includes(query));
        return { ...grp, files: matchedFiles };
      })
      .filter((grp) => grp.files.length > 0);
  }, [config.sourceGroups, query]);

  const filteredAsm = useMemo(() => {
    if (!query) return config.asmSources;
    return config.asmSources.filter((a) => a.toLowerCase().includes(query));
  }, [config.asmSources, query]);

  const filteredIncludes = useMemo(() => {
    if (!query) return config.includeDirs;
    return config.includeDirs.filter((inc) => inc.toLowerCase().includes(query));
  }, [config.includeDirs, query]);

  /** Batch scan a folder (like Keil batch import) for sources + headers */
  const handleBatchScanFolder = async () => {
    const dir = await window.mcuForge.selectDir('选择要批量导入的源码/头文件目录');
    if (!dir) return;
    const scan = await window.mcuForge.scanDir(config.projectDir, dir, config.excludedDirs);
    const foundSources = [...scan.cSources, ...scan.cppSources];

    const existingSources = new Set(config.sourceGroups.flatMap((g) => g.files));
    const newSources = foundSources.filter((s) => !existingSources.has(s));

    const existingIncs = new Set(config.includeDirs);
    const newIncs = scan.includeDirs.filter((i) => !existingIncs.has(i));

    const existingAsm = new Set(config.asmSources);
    const newAsm = scan.asmSources.filter((a) => !existingAsm.has(a));

    const nextGroups = [...config.sourceGroups];
    if (newSources.length > 0) {
      const bucket = new Map<string, string[]>();
      for (const f of newSources) {
        const parts = f.split('/');
        const gName = parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts.length === 2 ? parts[0] : 'Root';
        if (!bucket.has(gName)) bucket.set(gName, []);
        bucket.get(gName)!.push(f);
      }
      for (const [gName, files] of bucket.entries()) {
        const existingGrp = nextGroups.find((g) => g.name === gName);
        if (existingGrp) {
          existingGrp.files = Array.from(new Set([...existingGrp.files, ...files])).sort();
        } else {
          nextGroups.push({
            id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: gName,
            files: files.sort(),
          });
        }
      }
    }

    onChange({
      ...config,
      sourceGroups: nextGroups,
      includeDirs: Array.from(new Set([...config.includeDirs, ...newIncs])).sort(),
      asmSources: Array.from(new Set([...config.asmSources, ...newAsm])).sort(),
      linkerScript: config.linkerScript || scan.linkerScripts[0] || '',
    });

    onNotify(`批量导入完成：+${newSources.length} 源文件，+${newIncs.length} 头文件路径，+${newAsm.length} 汇编文件`);
  };

  /** Add files directly to a specific group */
  const handleAddFilesToGroup = async (groupId: string) => {
    const picked = await window.mcuForge.selectFiles({
      title: '选择要添加到分组的 C/C++ 源文件',
      multi: true,
      defaultPath: config.projectDir,
      filters: [{ name: 'C/C++ Sources', extensions: ['c', 'cpp', 'cc', 'cxx'] }],
    });
    if (!picked.length) return;
    const rels = await window.mcuForge.toRelative(config.projectDir, picked);
    const nextGroups = config.sourceGroups.map((g) =>
      g.id === groupId ? { ...g, files: Array.from(new Set([...g.files, ...rels])).sort() } : g
    );
    onChange({ ...config, sourceGroups: nextGroups });
    setExpanded((prev) => ({ ...prev, [groupId]: true }));
    onNotify(`已添加 ${rels.length} 个源文件`);
  };

  const disabledSet = useMemo(() => new Set(config.disabledFiles || []), [config.disabledFiles]);

  const toggleFileDisabled = (file: string) => {
    const next = new Set(config.disabledFiles || []);
    if (next.has(file)) {
      next.delete(file);
      onNotify(`已恢复参与编译: ${file.split('/').pop()}`);
    } else {
      next.add(file);
      onNotify(`已排除出编译 (保留在工程树): ${file.split('/').pop()}`);
    }
    onChange({ ...config, disabledFiles: Array.from(next) });
  };

  const handleRemoveFile = (groupId: string, file: string) => {
    const nextGroups = config.sourceGroups
      .map((g) => (g.id === groupId ? { ...g, files: g.files.filter((f) => f !== file) } : g))
      .filter((g) => g.files.length > 0);
    onChange({ ...config, sourceGroups: nextGroups });
  };

  const handleRemoveGroup = (groupId: string) => {
    onChange({ ...config, sourceGroups: config.sourceGroups.filter((g) => g.id !== groupId) });
  };

  const handleAddIncludeDir = async () => {
    const dir = await window.mcuForge.selectDir('选择头文件目录（将自动扫描子目录含 .h 的路径）');
    if (!dir) return;
    const scan = await window.mcuForge.scanDir(config.projectDir, dir, config.excludedDirs);
    const [directRel] = await window.mcuForge.toRelative(config.projectDir, [dir]);
    const candidates = scan.includeDirs.length > 0 ? scan.includeDirs : [directRel];
    const nextIncs = Array.from(new Set([...config.includeDirs, ...candidates])).sort();
    onChange({ ...config, includeDirs: nextIncs });
    onNotify(`已导入 ${candidates.length} 个头文件路径`);
  };

  const handleRemoveIncludeDir = (inc: string) => {
    onChange({ ...config, includeDirs: config.includeDirs.filter((i) => i !== inc) });
  };

  const handleAddAsm = async () => {
    const picked = await window.mcuForge.selectFiles({
      title: '选择启动/汇编文件 (.s / .S)',
      multi: true,
      defaultPath: config.projectDir,
      filters: [{ name: 'Assembly Files', extensions: ['s', 'S', 'asm'] }],
    });
    if (!picked.length) return;
    const rels = await window.mcuForge.toRelative(config.projectDir, picked);
    onChange({ ...config, asmSources: Array.from(new Set([...config.asmSources, ...rels])).sort() });
    setAsmExpanded(true);
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const newId = `grp-${Date.now()}`;
    onChange({
      ...config,
      sourceGroups: [
        ...config.sourceGroups,
        { id: newId, name: newGroupName.trim(), files: [] },
      ],
    });
    setExpanded((prev) => ({ ...prev, [newId]: true }));
    setNewGroupName('');
    setAddingGroup(false);
  };

  return (
    <aside className="sidebar">
      <div className="tree-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Layers size={15} color="#60a5fa" />
          工程管理器
        </div>
        <button
          className="btn btn-primary btn-sm"
          title="递归扫描文件夹并批量导入源码与头文件目录"
          onClick={handleBatchScanFolder}
        >
          <ScanSearch size={13} /> 批量导入
        </button>
      </div>

      {/* Sub-tabs: Source Groups vs Header Include Dirs */}
      <div className="tree-tabs">
        <button
          className={`tree-tab-btn ${treeTab === 'sources' ? 'active' : ''}`}
          onClick={() => setTreeTab('sources')}
        >
          <FileCode2 size={13} />
          源码分组 ({totalSources})
        </button>
        <button
          className={`tree-tab-btn ${treeTab === 'headers' ? 'active' : ''}`}
          onClick={() => setTreeTab('headers')}
        >
          <Folder size={13} />
          头文件 ({config.includeDirs.length})
        </button>
      </div>

      {/* Search + Collapse/Expand Controls */}
      <div className="tree-toolbar">
        <div className="tree-search-wrap">
          <Search size={13} className="tree-search-icon" />
          <input
            className="input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={treeTab === 'sources' ? '搜索源码文件或分组...' : '搜索头文件路径...'}
          />
          {searchQuery && (
            <button
              className="tree-search-clear"
              title="清空搜索"
              onClick={() => setSearchQuery('')}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {treeTab === 'sources' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm" onClick={expandAll} title="全部展开">
                <ChevronsUpDown size={12} /> 展开
              </button>
              <button className="btn btn-sm" onClick={collapseAll} title="全部折叠">
                <ChevronsDownUp size={12} /> 折叠
              </button>
            </div>
            <button
              className="btn btn-sm"
              title="新建源码分组"
              onClick={() => setAddingGroup((v) => !v)}
            >
              <FolderPlus size={12} /> 新分组
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={handleAddIncludeDir}>
              <FolderPlus size={12} /> 导入头文件目录
            </button>
          </div>
        )}
      </div>

      <div className="tree-scroll">
        {treeTab === 'sources' ? (
          <>
            {addingGroup && (
              <div style={{ padding: '4px 6px 8px', display: 'flex', gap: 4 }}>
                <input
                  className="input"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  placeholder="输入分组名..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                  autoFocus
                />
                <button className="btn btn-sm btn-primary" onClick={handleCreateGroup}>
                  添加
                </button>
              </div>
            )}

            {filteredGroups.length === 0 && (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                {query ? `未找到匹配 "${searchQuery}" 的源码` : '暂无源文件，点击上方“批量导入”添加'}
              </div>
            )}

            {filteredGroups.map((grp) => {
              // Auto-expand while searching; otherwise follow user's explicit expand state (default collapsed)
              const isExpanded = query.length > 0 ? true : !!expanded[grp.id];
              return (
                <div key={grp.id}>
                  <div className="tree-group-header" onClick={() => toggleGroup(grp.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <Folder size={13} color="#eab308" />
                      <span className="tree-item-text" style={{ color: 'var(--text-primary)' }}>
                        {grp.name}
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>({grp.files.length})</span>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-icon"
                        title="添加源文件到此分组"
                        onClick={() => handleAddFilesToGroup(grp.id)}
                      >
                        <FilePlus2 size={12} />
                      </button>
                      <button
                        className="btn-icon"
                        title="移除此分组"
                        onClick={() => handleRemoveGroup(grp.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {isExpanded &&
                    grp.files.map((file) => {
                      const isDisabled = disabledSet.has(file);
                      return (
                        <div
                          key={file}
                          className={`tree-item ${isDisabled ? 'disabled-file' : ''}`}
                          title={`${file}${isDisabled ? ' (已排除编译)' : ''}`}
                        >
                          <FileCode2 size={12} color={isDisabled ? '#6e7681' : '#60a5fa'} style={{ flexShrink: 0 }} />
                          <span className="tree-item-text">{file.split('/').pop()}</span>
                          <button
                            className="btn-icon"
                            style={{ padding: 2 }}
                            title={isDisabled ? '恢复参与编译' : '暂时排除编译 (Exclude from Build)'}
                            onClick={() => toggleFileDisabled(file)}
                          >
                            {isDisabled ? <EyeOff size={11} color="#fbbf24" /> : <Eye size={11} />}
                          </button>
                          <button
                            className="btn-icon"
                            style={{ padding: 2 }}
                            title="从工程移除"
                            onClick={() => handleRemoveFile(grp.id, file)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {/* Collapsible ASM / Startup section */}
            <div className="tree-section" style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              <div
                className="tree-group-header"
                onClick={() => setAsmExpanded((v) => !v)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {query.length > 0 || asmExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <FileText size={13} color="#c084fc" />
                  <span>汇编 / 启动文件 ({filteredAsm.length})</span>
                </div>
                <button
                  className="btn-icon"
                  title="添加 .s/.S 启动文件"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddAsm();
                  }}
                >
                  <FilePlus2 size={12} />
                </button>
              </div>
              {(query.length > 0 || asmExpanded) &&
                filteredAsm.map((asm) => (
                  <div key={asm} className="tree-item" title={asm}>
                    <FileText size={12} color="#c084fc" style={{ flexShrink: 0 }} />
                    <span className="tree-item-text">{asm.split('/').pop()}</span>
                    <button
                      className="btn-icon"
                      style={{ padding: 2 }}
                      onClick={() =>
                        onChange({ ...config, asmSources: config.asmSources.filter((a) => a !== asm) })
                      }
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
            </div>
          </>
        ) : (
          /* Headers Tab */
          <div className="tree-section">
            {filteredIncludes.length === 0 ? (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                {query ? `未找到匹配 "${searchQuery}" 的头文件路径` : '暂无头文件路径，点击上方按钮导入'}
              </div>
            ) : (
              filteredIncludes.map((inc) => (
                <div key={inc} className="tree-item" style={{ paddingLeft: 10 }} title={inc}>
                  <Folder size={13} color="#34d399" style={{ flexShrink: 0 }} />
                  <span className="tree-item-text">{inc}</span>
                  <button
                    className="btn-icon"
                    style={{ padding: 2 }}
                    title="移除此头文件路径"
                    onClick={() => handleRemoveIncludeDir(inc)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
