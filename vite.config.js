import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { exec } from 'child_process'

function runScriptPlugin() {
  return {
    name: 'run-script-plugin',
    configureServer(server) {
      server.middlewares.use('/api/run-script', (req, res) => {
        if (req.method === 'POST') {
          console.log('Running python update_feed.py...');
          // We assume python is in PATH and the GEMINI_API_KEY is either loaded in env or the user has set it
          exec('python scripts/update_feed.py', (error, stdout, stderr) => {
            res.setHeader('Content-Type', 'application/json');
            if (error) {
              console.error(`Script error: ${error.message}`);
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: error.message, stderr }));
              return;
            }
            console.log('Script finished successfully.');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, stdout }));
          });
        } else {
          res.statusCode = 405;
          res.end();
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), runScriptPlugin()],
  base: '/Knee-review-update/',
})
