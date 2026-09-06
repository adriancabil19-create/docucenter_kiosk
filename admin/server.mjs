import http from 'node:http';
import next from 'next';

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

http.createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
  console.log(`Admin server listening on ${hostname}:${port}`);
});
