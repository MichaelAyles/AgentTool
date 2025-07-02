import { Request, Response, Router } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import process from 'process';

const router = Router();

/**
 * GET /api/v1/system/info
 * Get system information including root directory and version
 */
router.get('/info', (req: Request, res: Response) => {
  try {
    // Get root directory (go up from backend to project root)
    const rootDirectory = join(process.cwd(), '../..');

    // Get version from package.json
    let version = '1.0.0';
    try {
      const packageJsonPath = join(rootDirectory, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      version = packageJson.version || '1.0.0';
    } catch (error) {
      console.warn('Could not read package.json for version:', error);
    }

    res.json({
      success: true,
      data: {
        rootDirectory,
        version,
        platform: process.platform,
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting system info:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYSTEM_INFO_ERROR',
        message: 'Failed to get system information',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default router;
