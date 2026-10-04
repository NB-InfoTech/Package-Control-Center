// Probe: does pre-writing "y" to choco's stdin answer the non-elevation prompt instantly?
const { spawn } = require('child_process');
const t0 = Date.now();
const c = spawn('choco', ['pin', 'add', '-n', 'python3', '-y', '--no-progress'], { windowsHide: true });
c.stdin.write('y\r\n');
c.stdin.end();
let out = '';
c.stdout.on('data', (d) => (out += d));
c.stderr.on('data', (d) => (out += d));
c.on('close', (code) => {
  console.log('EXIT', code, 'in', Math.round((Date.now() - t0) / 1000), 's');
  console.log(out.slice(0, 600));
});
