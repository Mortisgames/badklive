import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  timeout:30000,
  workers:1,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1280,height:900}},
  webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
});
