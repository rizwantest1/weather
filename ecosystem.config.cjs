// PM2 process configuration for running the Next.js production server
// inside the sandbox. Uses `next start` on port 3000.
module.exports = {
  apps: [
    {
      name: "webapp",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 0.0.0.0 -p 3000",
      cwd: "/home/user/webapp",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
