import * as fs from 'fs';
import { detectEnvironment } from './core/detector';
import { importProjectDirectory } from './core/parser';
import { importKeilUvprojx } from './core/keilParser';
import { buildGeneratedPreviews } from './core/generator';

const env = detectEnvironment();
console.log('=== Environment Detection ===');
console.log(`Platform: ${env.platform} (${env.arch}), Found tools: ${env.tools.length}`);
for (const t of env.tools) {
  console.log(`  [${t.category}] ${t.name} => ${t.path}`);
}

const sampleDir = 'E:\\code\\stm32\\lag_gas_mkf';
if (fs.existsSync(sampleDir)) {
  console.log('\n=== Importing Sample Project ===');
  const { config, importSource } = importProjectDirectory(sampleDir, env);
  console.log(`Import Source: ${importSource}`);
  console.log(`Target: ${config.name}, Kind: ${config.projectKind}, Build: ${config.buildSystem}`);
  console.log(`CPU: ${config.flags.cpuFlags}`);
  console.log(`Defines (${config.defines.length}): ${config.defines.join(', ')}`);
  console.log(`Includes (${config.includeDirs.length}): ${config.includeDirs.slice(0, 4).join(', ')} ...`);
  console.log(
    `Source Groups (${config.sourceGroups.length}), Total C/C++ files: ${config.sourceGroups.reduce((a, g) => a + g.files.length, 0)}`
  );
  console.log(`ASM Sources (${config.asmSources.length}): ${config.asmSources.join(', ')}`);
  console.log(`Linker Script: ${config.linkerScript}`);
  console.log(`Toolchain Dir: ${config.toolchain.compilerDir}`);
  console.log(`Debugger: ${config.debugger.type} (${config.debugger.serverPath})`);

  const previews = buildGeneratedPreviews(config);
  console.log(`\n=== Generated Files Preview (${previews.length} files, read-only test) ===`);
  for (const p of previews) {
    console.log(`  - ${p.relativePath} (${p.content.length} bytes, existed=${p.existed})`);
  }
}

const sampleUvprojx = 'E:\\code\\stm32\\lag_gas_mkf\\MDK-ARM\\lgas.uvprojx';
if (fs.existsSync(sampleUvprojx)) {
  console.log('\n=== Keil .uvprojx Parser Self-Test ===');
  const ws = importKeilUvprojx(sampleUvprojx, env);
  const p0 = ws.programs[0];
  console.log(`Summary: ${ws.importSummary}`);
  console.log(`Root: ${ws.workspaceDir}, Target: ${p0.name}, Device: ${p0.debugger.deviceName}`);
  console.log(`CPU: ${p0.flags.cpuFlags}, Flash: ${p0.memoryLayout?.flashOrigin} (${p0.memoryLayout?.flashLength})`);
  console.log(`Groups: ${p0.sourceGroups.length}, C files: ${p0.sourceGroups.reduce((a, g) => a + g.files.length, 0)}, Disabled: ${p0.disabledFiles?.length || 0}`);
  console.log(`Includes: ${p0.includeDirs.length}, Defines: ${p0.defines.join(', ')}, ASM: ${p0.asmSources.join(', ')}`);
}
