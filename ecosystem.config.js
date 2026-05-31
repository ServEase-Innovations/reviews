module.exports = {
  apps: [
    {
      name: "reviews",
      script: "dist/server.js",
      env: { NODE_ENV: "production" },
    },
  ],
};
