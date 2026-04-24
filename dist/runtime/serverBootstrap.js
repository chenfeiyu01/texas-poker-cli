"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPortOpen = isPortOpen;
exports.startLocalServer = startLocalServer;
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
const path_1 = __importDefault(require("path"));
function isPortOpen(port) {
    return new Promise((resolve) => {
        const socket = new net_1.default.Socket();
        socket.setTimeout(500);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
        socket.connect(port, '127.0.0.1');
    });
}
async function startLocalServer(port) {
    const serverPath = path_1.default.resolve(__dirname, '..', 'index.js');
    const child = (0, child_process_1.spawn)(process.execPath, [serverPath, 'server', '--port', String(port)], {
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
