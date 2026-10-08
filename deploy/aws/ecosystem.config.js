// PM2 process definition. App name is unique to this project.
module.exports = {
  apps: [{
    name: 'loco-tm-cms',
    cwd: '/home/ubuntu/loco-tm-cms',
    script: 'server.js',
    instances: 1,                 // keep 1: live state is held in memory
    exec_mode: 'fork',
    max_memory_restart: '600M',
    env: { NODE_ENV: 'production' },  // everything else comes from /home/ubuntu/loco-tm-cms/.env
    out_file: '/home/ubuntu/.pm2/logs/loco-tm-cms-out.log',
    error_file: '/home/ubuntu/.pm2/logs/loco-tm-cms-err.log',
    time: true,
  }],
};
