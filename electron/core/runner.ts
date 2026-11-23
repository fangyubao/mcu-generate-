import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import { McuProjectConfig, RunCommandEvent } from './types';
import { getHostPlatform } from './platform';

let activeProcess: ChildProcess | null = null;

export function stopActiveCommand(): boolean {
  if (activeProcess && !activeProcess.killed) {
    activeProcess.kill();
    activeProcess = null;
    return true;
  }
  return false;
}

function parseArmSizeOutput(chunk: string): RunCommandEvent['memoryUsage'] | undefined {
  // Matches typical `arm-none-eabi-size` output:
  //    text    data     bss     dec     hex filename
  //   41234     512    4096   45842    b312 build/lgas.elf
  const lines = chunk.split(/\r?\n/);
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+[0-9a-fA-F]+\s+.+/);
    if (m) {
      return {
        text: parseInt(m[1], 10),
        data: parseInt(m[2], 10),
        bss: parseInt(m[3], 10),
        dec: parseInt(m[4], 10),
      };
    }
  }
  return undefined;
}

export function runProjectAction(
  config: McuProjectConfig,
  action: 'build' | 'clean' | 'flash' | 'rebuild',
  onEvent: (ev: RunCommandEvent) => void
): void {
  stopActiveCommand();

  const platform = getHostPlatform();
  const cwd = path.resolve(config.projectDir);
  const makeBin = config.toolchain.makeExecutable.trim() || 'make';
  const cmakeBin = config.toolchain.cmakeExecutable.trim() || 'cmake';

  let command = '';
  let args: string[] = [];

  if (config.buildSystem === 'makefile') {
    command = makeBin;
    if (action === 'build') args = ['all'];
    else if (action === 'clean') args = ['clean'];
    else if (action === 'flash') args = ['flash'];
    else if (action === 'rebuild') args = ['clean', 'all'];
  } else {
    command = cmakeBin;
    const bdir = config.buildDir || 'build';
    if (action === 'clean') {
      args = ['--build', bdir, '--target', 'clean'];
    } else if (action === 'build' || action === 'rebuild') {
      const tcArg =
        config.projectKind !== 'generic-c'
          ? `-DCMAKE_TOOLCHAIN_FILE=cmake/mcu-toolchain.cmake`
          : '';
      // Run configure + build via shell
      const cmdLine = `"${cmakeBin}" -B "${bdir}" ${tcArg} -DCMAKE_EXPORT_COMPILE_COMMANDS=ON && "${cmakeBin}" --build "${bdir}" -j`;
      spawnShell(cmdLine, cwd, onEvent);
      return;
    } else {
      onEvent({
        type: 'info',
        data: 'CMake 模式下请使用 Makefile 烧录或在终端中执行自定义烧录命令。\n',
      });
      onEvent({ type: 'exit', data: '', exitCode: 0 });
      return;
    }
  }

  onEvent({
    type: 'info',
    data: `[${cwd}] > ${command} ${args.join(' ')}\n`,
  });

  // Prepend compilerDir to PATH so child tools can find DLLs / helper binaries
  const env = { ...process.env };
  if (config.toolchain.compilerDir.trim()) {
    const sep = platform === 'win32' ? ';' : ':';
    env.PATH = `${path.normalize(config.toolchain.compilerDir.trim())}${sep}${env.PATH || ''}`;
  }

  const child = spawn(command, args, {
    cwd,
    env,
    shell: platform === 'win32',
  });
  activeProcess = child;

  child.stdout?.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8');
    const memoryUsage = parseArmSizeOutput(text);
    onEvent({ type: 'stdout', data: text, memoryUsage });
  });

  child.stderr?.on('data', (buf: Buffer) => {
    onEvent({ type: 'stderr', data: buf.toString('utf8') });
  });

  child.on('error', (err) => {
    onEvent({ type: 'stderr', data: `Failed to start process: ${err.message}\n` });
    onEvent({ type: 'exit', data: '', exitCode: -1 });
    activeProcess = null;
  });

  child.on('close', (code) => {
    onEvent({ type: 'exit', data: '', exitCode: code ?? 0 });
    activeProcess = null;
  });
}

function spawnShell(commandLine: string, cwd: string, onEvent: (ev: RunCommandEvent) => void): void {
  onEvent({ type: 'info', data: `[${cwd}] > ${commandLine}\n` });
  const child = spawn(commandLine, { cwd, shell: true });
  activeProcess = child;

  child.stdout?.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8');
    const memoryUsage = parseArmSizeOutput(text);
    onEvent({ type: 'stdout', data: text, memoryUsage });
  });
  child.stderr?.on('data', (buf: Buffer) => {
    onEvent({ type: 'stderr', data: buf.toString('utf8') });
  });
  child.on('error', (err) => {
    onEvent({ type: 'stderr', data: `Failed to start process: ${err.message}\n` });
    onEvent({ type: 'exit', data: '', exitCode: -1 });
    activeProcess = null;
  });
  child.on('close', (code) => {
    onEvent({ type: 'exit', data: '', exitCode: code ?? 0 });
    activeProcess = null;
  });
}

/** Sequentially build all programs in an IAP / multi-program workspace */
export function runBatchBuild(
  programs: McuProjectConfig[],
  onEvent: (ev: RunCommandEvent) => void
): void {
  stopActiveCommand();
  if (programs.length === 0) {
    onEvent({ type: 'exit', data: '', exitCode: 0 });
    return;
  }

  let idx = 0;
  const runNext = () => {
    if (idx >= programs.length) {
      onEvent({ type: 'info', data: `\n=== 全部 ${programs.length} 个程序段编译完成 ===\n` });
      onEvent({ type: 'exit', data: '', exitCode: 0 });
      return;
    }
    const prog = programs[idx++];
    onEvent({
      type: 'info',
      data: `\n=== [${idx}/${programs.length}] 开始编译程序: ${prog.name} (${prog.projectDir}) ===\n`,
    });
    runProjectAction(prog, 'build', (ev) => {
      if (ev.type === 'exit') {
        if ((ev.exitCode ?? 0) !== 0) {
          onEvent({
            type: 'stderr',
            data: `\n程序 "${prog.name}" 编译失败 (exit code ${ev.exitCode})，已停止后续编译。\n`,
          });
          onEvent({ type: 'exit', data: '', exitCode: ev.exitCode ?? 1 });
        } else {
          runNext();
        }
      } else {
        onEvent(ev);
      }
    });
  };

  runNext();
}
