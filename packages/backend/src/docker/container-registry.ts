import { EventEmitter } from 'events';
import { Docker } from 'dockerode';
import { structuredLogger } from '../middleware/logging.js';

export interface ContainerImage {
  name: string;
  tag: string;
  fullName: string;
  description: string;
  size: number;
  created: Date;
  architecture: string;
  os: string;
  digest: string;
  securityProfile: string;
  capabilities: string[];
  metadata: {
    version: string;
    maintainer: string;
    labels: Record<string, string>;
    exposedPorts: number[];
    entrypoint: string[];
    cmd: string[];
    workdir: string;
    user: string;
  };
}

export interface BuildOptions {
  dockerfile: string;
  context: string;
  buildArgs: Record<string, string>;
  labels: Record<string, string>;
  target?: string;
  noCache?: boolean;
  pull?: boolean;
  platform?: string;
}

export class ContainerRegistry extends EventEmitter {
  private docker: Docker;
  private images = new Map<string, ContainerImage>();
  private buildQueue: Array<{ id: string; options: BuildOptions }> = [];
  private isBuilding = false;

  constructor() {
    super();
    
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    });

    this.refreshImageList();
    structuredLogger.info('Container registry initialized');
  }

  /**
   * Get list of available images
   */
  async listImages(): Promise<ContainerImage[]> {
    await this.refreshImageList();
    return Array.from(this.images.values());
  }

  /**
   * Get specific image information
   */
  getImage(nameOrId: string): ContainerImage | undefined {
    return this.images.get(nameOrId) || 
           Array.from(this.images.values()).find(img => 
             img.fullName === nameOrId || img.digest === nameOrId
           );
  }

  /**
   * Build a new container image
   */
  async buildImage(
    name: string,
    tag: string,
    options: BuildOptions
  ): Promise<{ success: boolean; imageId?: string; logs: string[] }> {
    const buildId = `${name}:${tag}-${Date.now()}`;
    const logs: string[] = [];

    try {
      structuredLogger.info('Starting image build', { name, tag, buildId });

      // Add to build queue
      this.buildQueue.push({ id: buildId, options });
      
      if (this.isBuilding) {
        logs.push('Build queued - another build in progress');
        return { success: false, logs };
      }

      this.isBuilding = true;

      // Build the image
      const stream = await this.docker.buildImage(
        options.context,
        {
          t: `${name}:${tag}`,
          dockerfile: options.dockerfile,
          buildargs: options.buildArgs,
          labels: {
            ...options.labels,
            'vibe.build.id': buildId,
            'vibe.build.timestamp': new Date().toISOString(),
          },
          target: options.target,
          nocache: options.noCache || false,
          pull: options.pull || false,
          platform: options.platform,
        }
      );

      // Parse build output
      return new Promise((resolve) => {
        let imageId: string | undefined;

        this.docker.modem.followProgress(stream, (err, output) => {
          this.isBuilding = false;
          
          if (err) {
            logs.push(`Build failed: ${err.message}`);
            structuredLogger.error('Image build failed', err, { name, tag, buildId });
            resolve({ success: false, logs });
          } else {
            // Extract image ID from output
            if (output) {
              const successLine = output.find((line: any) => line.stream?.includes('Successfully built'));
              if (successLine) {
                imageId = successLine.stream.split(' ').pop()?.trim();
              }
            }

            logs.push(`Build completed successfully`);
            structuredLogger.info('Image build completed', { name, tag, buildId, imageId });
            
            // Refresh image list
            this.refreshImageList();
            
            resolve({ success: true, imageId, logs });
          }
        }, (event: any) => {
          if (event.stream) {
            logs.push(event.stream.trim());
          }
          if (event.error) {
            logs.push(`ERROR: ${event.error}`);
          }
          
          this.emit('buildProgress', { buildId, event, logs: logs.slice(-10) });
        });
      });
    } catch (error) {
      this.isBuilding = false;
      logs.push(`Build error: ${(error as Error).message}`);
      structuredLogger.error('Image build error', error as Error, { name, tag, buildId });
      return { success: false, logs };
    }
  }

  /**
   * Pull an image from a registry
   */
  async pullImage(name: string, tag: string = 'latest'): Promise<{
    success: boolean;
    logs: string[];
  }> {
    const fullName = `${name}:${tag}`;
    const logs: string[] = [];

    try {
      structuredLogger.info('Pulling image', { name, tag, fullName });

      const stream = await this.docker.pull(fullName);
      
      return new Promise((resolve) => {
        this.docker.modem.followProgress(stream, (err, output) => {
          if (err) {
            logs.push(`Pull failed: ${err.message}`);
            structuredLogger.error('Image pull failed', err, { fullName });
            resolve({ success: false, logs });
          } else {
            logs.push(`Image ${fullName} pulled successfully`);
            structuredLogger.info('Image pull completed', { fullName });
            
            // Refresh image list
            this.refreshImageList();
            
            resolve({ success: true, logs });
          }
        }, (event: any) => {
          if (event.status) {
            logs.push(`${event.status}${event.id ? ` ${event.id}` : ''}`);
          }
          
          this.emit('pullProgress', { fullName, event, logs: logs.slice(-10) });
        });
      });
    } catch (error) {
      logs.push(`Pull error: ${(error as Error).message}`);
      structuredLogger.error('Image pull error', error as Error, { fullName });
      return { success: false, logs };
    }
  }

  /**
   * Remove an image
   */
  async removeImage(nameOrId: string, force: boolean = false): Promise<boolean> {
    try {
      const image = this.docker.getImage(nameOrId);
      await image.remove({ force });
      
      this.images.delete(nameOrId);
      this.emit('imageRemoved', { nameOrId });
      
      structuredLogger.info('Image removed', { nameOrId, force });
      return true;
    } catch (error) {
      structuredLogger.error('Failed to remove image', error as Error, { nameOrId });
      return false;
    }
  }

  /**
   * Get image history
   */
  async getImageHistory(nameOrId: string): Promise<any[]> {
    try {
      const image = this.docker.getImage(nameOrId);
      const history = await image.history();
      return history;
    } catch (error) {
      structuredLogger.error('Failed to get image history', error as Error, { nameOrId });
      return [];
    }
  }

  /**
   * Inspect image details
   */
  async inspectImage(nameOrId: string): Promise<any> {
    try {
      const image = this.docker.getImage(nameOrId);
      const details = await image.inspect();
      return details;
    } catch (error) {
      structuredLogger.error('Failed to inspect image', error as Error, { nameOrId });
      return null;
    }
  }

  /**
   * Search for images in remote registries
   */
  async searchImages(term: string, limit: number = 25): Promise<any[]> {
    try {
      const results = await this.docker.searchImages({ term, limit });
      return results;
    } catch (error) {
      structuredLogger.error('Failed to search images', error as Error, { term });
      return [];
    }
  }

  /**
   * Create optimized sandbox images
   */
  async createSandboxImages(): Promise<{ success: boolean; created: string[] }> {
    const created: string[] = [];
    
    try {
      // Base sandbox image with security hardening
      const baseImageDockerfile = `
FROM ubuntu:22.04

# Install security tools and basic utilities
RUN apt-get update && apt-get install -y \\
    sudo curl wget git vim nano \\
    python3 python3-pip nodejs npm \\
    build-essential gcc g++ make \\
    && rm -rf /var/lib/apt/lists/*

# Create non-root users
RUN groupadd -g 1000 sandbox && \\
    useradd -m -s /bin/bash -g sandbox -u 1000 sandbox && \\
    groupadd -g 1001 developer && \\
    useradd -m -s /bin/bash -g developer -u 1001 developer && \\
    groupadd -g 1002 student && \\
    useradd -m -s /bin/bash -g student -u 1002 student

# Set up secure directories
RUN mkdir -p /workspace /tmp/vibe-sandbox && \\
    chown -R sandbox:sandbox /workspace && \\
    chmod 755 /workspace

# Install Python packages in user space
USER sandbox
RUN pip3 install --user --no-cache-dir \\
    requests numpy pandas matplotlib seaborn \\
    jupyter notebook jupyterlab

# Switch back to root for final setup
USER root

# Security hardening
RUN echo "sandbox ALL=(sandbox) NOPASSWD: ALL" >> /etc/sudoers && \\
    chmod 440 /etc/sudoers

# Set default user and working directory
USER sandbox
WORKDIR /workspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
    CMD echo "Sandbox container healthy"

# Default command
CMD ["/bin/bash"]
`;

      const buildResult = await this.buildImage(
        'vibe-sandbox',
        'base',
        {
          dockerfile: 'Dockerfile',
          context: '/tmp',
          buildArgs: {},
          labels: {
            'vibe.image.type': 'sandbox',
            'vibe.image.profile': 'base',
            'vibe.image.description': 'Base sandbox image with security hardening',
          },
        }
      );

      if (buildResult.success) {
        created.push('vibe-sandbox:base');
      }

      // Development image with additional tools
      const devImageDockerfile = `
FROM vibe-sandbox:base

USER root

# Install development tools
RUN apt-get update && apt-get install -y \\
    docker.io docker-compose \\
    terraform ansible \\
    openjdk-11-jdk \\
    && rm -rf /var/lib/apt/lists/*

# Install Node.js tools
RUN npm install -g \\
    typescript ts-node \\
    eslint prettier \\
    jest cypress \\
    @angular/cli @vue/cli create-react-app

# Install Python development tools
USER developer
RUN pip3 install --user --no-cache-dir \\
    flask django fastapi \\
    pytest black flake8 \\
    tensorflow pytorch

USER root
WORKDIR /workspace

# Enhanced security for development
RUN echo "developer ALL=(developer) NOPASSWD: ALL" >> /etc/sudoers

USER developer
CMD ["/bin/bash"]
`;

      const devBuildResult = await this.buildImage(
        'vibe-sandbox',
        'development',
        {
          dockerfile: 'Dockerfile.dev',
          context: '/tmp',
          buildArgs: {},
          labels: {
            'vibe.image.type': 'sandbox',
            'vibe.image.profile': 'development',
            'vibe.image.description': 'Development sandbox with additional tools',
          },
        }
      );

      if (devBuildResult.success) {
        created.push('vibe-sandbox:development');
      }

      // Educational image for learning environments
      const eduImageDockerfile = `
FROM vibe-sandbox:base

USER root

# Install educational tools
RUN apt-get update && apt-get install -y \\
    scratch \\
    python3-turtle \\
    idle3 \\
    && rm -rf /var/lib/apt/lists/*

# Install educational Python packages
USER student
RUN pip3 install --user --no-cache-dir \\
    pygame \\
    turtle \\
    matplotlib \\
    numpy

# Set up educational environment
USER root
RUN mkdir -p /home/student/projects /home/student/examples && \\
    chown -R student:student /home/student

# Copy example code and tutorials
COPY examples/ /home/student/examples/
RUN chown -R student:student /home/student/examples

USER student
WORKDIR /home/student
CMD ["/bin/bash"]
`;

      const eduBuildResult = await this.buildImage(
        'vibe-sandbox',
        'educational',
        {
          dockerfile: 'Dockerfile.edu',
          context: '/tmp',
          buildArgs: {},
          labels: {
            'vibe.image.type': 'sandbox',
            'vibe.image.profile': 'educational',
            'vibe.image.description': 'Educational sandbox for learning environments',
          },
        }
      );

      if (eduBuildResult.success) {
        created.push('vibe-sandbox:educational');
      }

      structuredLogger.info('Sandbox images creation completed', { created });
      return { success: true, created };
    } catch (error) {
      structuredLogger.error('Failed to create sandbox images', error as Error);
      return { success: false, created };
    }
  }

  /**
   * Clean up unused images
   */
  async cleanupUnusedImages(): Promise<{ removed: string[]; spaceReclaimed: number }> {
    try {
      const pruneResult = await this.docker.pruneImages({
        filters: {
          dangling: { false: true }, // Remove untagged images
        },
      });

      const removed = pruneResult.ImagesDeleted?.map((img: any) => img.Deleted || img.Untagged) || [];
      const spaceReclaimed = pruneResult.SpaceReclaimed || 0;

      this.refreshImageList();
      
      structuredLogger.info('Image cleanup completed', { removed: removed.length, spaceReclaimed });
      return { removed, spaceReclaimed };
    } catch (error) {
      structuredLogger.error('Image cleanup failed', error as Error);
      return { removed: [], spaceReclaimed: 0 };
    }
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats(): Promise<{
    totalImages: number;
    totalSize: number;
    byProfile: Record<string, number>;
    oldestImage: Date | null;
    newestImage: Date | null;
  }> {
    await this.refreshImageList();
    
    const images = Array.from(this.images.values());
    const totalImages = images.length;
    const totalSize = images.reduce((sum, img) => sum + img.size, 0);
    
    const byProfile: Record<string, number> = {};
    for (const image of images) {
      byProfile[image.securityProfile] = (byProfile[image.securityProfile] || 0) + 1;
    }
    
    const dates = images.map(img => img.created).sort((a, b) => a.getTime() - b.getTime());
    const oldestImage = dates.length > 0 ? dates[0] : null;
    const newestImage = dates.length > 0 ? dates[dates.length - 1] : null;

    return {
      totalImages,
      totalSize,
      byProfile,
      oldestImage,
      newestImage,
    };
  }

  /**
   * Refresh the image list from Docker
   */
  private async refreshImageList(): Promise<void> {
    try {
      const dockerImages = await this.docker.listImages();
      this.images.clear();

      for (const dockerImage of dockerImages) {
        if (!dockerImage.RepoTags) continue;

        for (const repoTag of dockerImage.RepoTags) {
          const [name, tag] = repoTag.split(':');
          
          const image: ContainerImage = {
            name,
            tag,
            fullName: repoTag,
            description: dockerImage.Labels?.['vibe.image.description'] || '',
            size: dockerImage.Size,
            created: new Date(dockerImage.Created * 1000),
            architecture: dockerImage.Architecture || 'unknown',
            os: dockerImage.Os || 'unknown',
            digest: dockerImage.Id,
            securityProfile: dockerImage.Labels?.['vibe.image.profile'] || 'unknown',
            capabilities: (dockerImage.Labels?.['vibe.image.capabilities'] || '').split(',').filter(Boolean),
            metadata: {
              version: dockerImage.Labels?.['version'] || '1.0.0',
              maintainer: dockerImage.Labels?.['maintainer'] || 'unknown',
              labels: dockerImage.Labels || {},
              exposedPorts: Object.keys(dockerImage.Config?.ExposedPorts || {}).map(port => 
                parseInt(port.split('/')[0])
              ),
              entrypoint: dockerImage.Config?.Entrypoint || [],
              cmd: dockerImage.Config?.Cmd || [],
              workdir: dockerImage.Config?.WorkingDir || '/',
              user: dockerImage.Config?.User || 'root',
            },
          };

          this.images.set(repoTag, image);
        }
      }

      this.emit('imageListRefreshed', { count: this.images.size });
    } catch (error) {
      structuredLogger.error('Failed to refresh image list', error as Error);
    }
  }

  /**
   * Close the container registry
   */
  close(): void {
    this.removeAllListeners();
    structuredLogger.info('Container registry closed');
  }
}

// Export singleton instance
export const containerRegistry = new ContainerRegistry();