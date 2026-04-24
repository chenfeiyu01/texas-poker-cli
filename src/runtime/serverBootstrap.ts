import { spawn } from 'child_process';
import net from 'net';
import path from 'path';

export function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

export async function startLocalServer(port: number): Promise<void> {
  const serverPath = path.resolve(__dirname, '..', 'index.js');
  const child = spawn(process.execPath, [serverPath, 'server', '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (await isPortOpen(port)) {
      return;
    }
  }

  throw new Error('服务器启动超时');
}
