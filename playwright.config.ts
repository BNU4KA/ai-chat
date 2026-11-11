import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'e2e',timeout:30000,fullyParallel:false,workers:1,
 use:{baseURL:'http://localhost:8092',channel:process.env.CI?undefined:'chrome',trace:'retain-on-failure'},
 webServer:{command:'pnpm --filter @ai-chat/client exec expo start --web --port 8092',url:'http://localhost:8092',reuseExistingServer:false,timeout:120000,env:{CI:'1',EXPO_PUBLIC_API_URL:'http://localhost:3001',EXPO_PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key'}},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome'],channel:process.env.CI?undefined:'chrome'}},{name:'mobile-web',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',channel:process.env.CI?undefined:'chrome'}}],
});
