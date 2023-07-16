module.exports = {
  apps: [
    {
      script: 'app.js',
      watch: true,
      name: 'chat:3000',
      script: 'pnpm',
      args: 'dev',
      // cwd: '/node-next-framework/projects/lt.cncoders.tech',
      cwd: __dirname,
      ignore_watch: ['data', 'public', 'package.json', '.git', '.gitignore', '.next'],
      error_file: './data/logs/error.log',
      min_uptime: '60s',
      node_args: '--harmony',
      env: {
        NODE_ENV: 'development',
      },
      max_memory_restart: '300M',
      // "watch_options": {
      //   "usePolling": true
      // }
    },
  ],
};
