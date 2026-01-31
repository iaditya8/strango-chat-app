// ecosystem.config.js - PM2 Configuration for Production
module.exports = {
  apps: [{
    name: 'strango-server',
    script: 'server/server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    
    // Performance settings
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 4000,
      MAX_CONNECTIONS: 1000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000,
      MAX_CONNECTIONS: 2000
    },
    
    // Logging
    log_file: 'logs/combined.log',
    out_file: 'logs/out.log',
    error_file: 'logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto-restart settings
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Health monitoring
    min_uptime: '10s',
    max_restarts: 10,
    
    // Advanced settings
    merge_logs: true,
    combine_logs: true,
    
    // Cluster settings
    instance_var: 'INSTANCE_ID'
  }]
};