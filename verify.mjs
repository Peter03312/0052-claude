#!/usr/bin/env node
/**
 * 一次性验收：类型检查 → 单元测试 → 生产构建 → 静态服务器首页冒烟。
 * 不依赖 shell 特性，Windows/macOS/Linux 与容器内均可运行：
 *   node verify.mjs
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      ...options
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} 退出码 ${code}`));
    });
  });
}

/** 等待端口上的 HTTP 服务返回 200 */
async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return await res.text();
    } catch {
      // 服务器尚未就绪
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`首页冒烟失败：${url} 在 ${timeoutMs}ms 内没有返回 200`);
}

async function smokeTest() {
  const port = Number(process.env.SMOKE_PORT ?? 4180);
  // 选一个空闲端口，避免与本机残留服务冲突
  const freePort = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(port, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on('error', () => {
      // 指定端口被占用就交给系统分配
      const s2 = net.createServer();
      s2.listen(0, '127.0.0.1', () => {
        const p = s2.address().port;
        s2.close(() => resolve(p));
      });
    });
  });

  // 直接用 node 调用本地 vite，避免 npx 多包一层 shell 导致 kill 时留下孤儿进程占用端口
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(freePort), '--strictPort'], {
    cwd: root,
    // 冒烟服务器输出无需消费，直接丢弃，避免管道缓冲写满导致子进程阻塞
    stdio: 'ignore'
  });
  const stopServer = () => {
    try { server.kill('SIGTERM'); } catch { /* 已退出 */ }
  };

  try {
    const body = await waitForHttp(`http://127.0.0.1:${freePort}/`, 30_000);
    if (!body.includes('id="app"')) throw new Error('冒烟失败：缺少 #app 挂载点');
    // 相对路径 ./assets/*.js（posix 与 windows 路径分隔符都兼容）
    if (!/src="\.[/\\]assets[/\\][^"]+\.js"/.test(body)) {
      throw new Error('冒烟失败：首页未引用本地构建产物');
    }
    if (/https?:\/\/[^"]*(googleapis|gstatic|cdn|analytics)/i.test(body)) {
      throw new Error('冒烟失败：首页引用了外部资源，违反离线要求');
    }
    console.log(`✅ 首页冒烟通过（端口 ${freePort}）`);
  } finally {
    stopServer();
    await once(server, 'exit').catch(() => {});
  }
}

async function main() {
  console.log('==> 1/4 TypeScript 类型检查');
  await run(npx, ['tsc', '--noEmit']);

  console.log('==> 2/4 Vitest 单元测试');
  await run(npm, ['run', 'test:unit']);

  console.log('==> 3/4 生产构建');
  await run(npm, ['run', 'build']);

  console.log('==> 4/4 首页冒烟（静态服务器 + HTTP 探测）');
  await smokeTest();

  console.log('✅ verify 全部通过：类型、单测、构建、首页冒烟');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
