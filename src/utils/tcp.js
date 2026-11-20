const net = require('node:net');

function tcpProbe(host, port, timeout = 1000) {
    return new Promise((resolve) => {
        let socket;
        let settled = false;

        const finish = (open, reason) => {
            if (settled) return;
            settled = true;
            if (socket) socket.destroy();
            resolve({ host, port, open, reason });
        };

        try {
            socket = net.connect({ host, port });
        } catch (err) {
            finish(false, err.code || err.message);
            return;
        }

        socket.setTimeout(timeout);
        socket.once('connect', () => finish(true, 'CONNECTED'));
        socket.once('timeout', () => finish(false, 'ETIMEDOUT'));
        socket.once('error', (err) => finish(false, err.code || err.message));
    });
}

module.exports = { tcpProbe };
