import { defineConfig, devices } from '@playwright/test';

// 验收测试：本地起生产构建后的静态服务器，完全离线运行。
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 无 root 环境（如受限容器）可把浏览器依赖库解压到家目录后经此环境变量注入；
        // 已有系统库时该目录不存在也无副作用。
        launchOptions: {
          env: {
            ...process.env,
            LD_LIBRARY_PATH: [
              process.env.LD_LIBRARY_PATH ?? '',
              `${process.env.HOME ?? ''}/chromelibs/root/usr/lib/x86_64-linux-gnu`,
              `${process.env.HOME ?? ''}/chromelibs/root/lib/x86_64-linux-gnu`
            ].filter(Boolean).join(':')
          }
        }
      }
    }
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
