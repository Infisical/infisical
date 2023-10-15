module.exports = {
  apps: [
    {
      name: "backend",
      script: "npm",
      args: "run start",
      cwd: "./backend",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
    {
      name: "nginx",
      script: "nginx",
      args: "-g 'daemon off;'",
      exec_interpreter: "none",
    },
  ],
};
