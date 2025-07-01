import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  Users,
  Terminal,
  Package,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Zap,
  Server,
  Monitor,
  RefreshCw,
  Settings,
  Download,
  Upload,
  Eye,
  EyeOff,
  BarChart3,
  LineChart,
  PieChart,
  Calendar,
  Filter,
} from 'lucide-react';

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    temperature?: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
}

export interface ServiceMetrics {
  backend: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
  };
  adapters: {
    total: number;
    active: number;
    healthy: number;
    errored: number;
  };
  sessions: {
    active: number;
    total: number;
    averageDuration: number;
  };
  websockets: {
    connected: number;
    totalConnections: number;
    messagesPerSecond: number;
  };
}

export interface AlertInfo {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  source: 'system' | 'adapter' | 'security' | 'performance';
}

export interface MonitoringDashboardProps {
  systemMetrics: SystemMetrics;
  serviceMetrics: ServiceMetrics;
  alerts: AlertInfo[];
  onRefresh: () => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onDismissAlert: (alertId: string) => void;
  onExportMetrics: () => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({
  systemMetrics,
  serviceMetrics,
  alerts,
  onRefresh,
  onAcknowledgeAlert,
  onDismissAlert,
  onExportMetrics,
  autoRefresh = true,
  refreshInterval = 30000,
}) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [selectedMetricView, setSelectedMetricView] = useState<'overview' | 'detailed'>('overview');
  const [hiddenAlertTypes, setHiddenAlertTypes] = useState<Set<string>>(new Set());
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(autoRefresh);

  // Auto-refresh effect
  useEffect(() => {
    if (!isAutoRefreshing) return;

    const interval = setInterval(() => {
      onRefresh();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [isAutoRefreshing, refreshInterval, onRefresh]);

  const toggleAlertType = (type: string) => {
    const newHidden = new Set(hiddenAlertTypes);
    if (newHidden.has(type)) {
      newHidden.delete(type);
    } else {
      newHidden.add(type);
    }
    setHiddenAlertTypes(newHidden);
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getStatusColor = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 dark:text-green-400';
      case 'degraded':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'unhealthy':
        return 'text-red-600 dark:text-red-400';
    }
  };

  const getStatusIcon = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getAlertIcon = (type: AlertInfo['type']) => {
    switch (type) {
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'info':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const filteredAlerts = alerts.filter(alert => 
    !hiddenAlertTypes.has(alert.type) && !alert.acknowledged
  );

  const criticalAlerts = alerts.filter(alert => alert.type === 'error' && !alert.acknowledged);
  const warningAlerts = alerts.filter(alert => alert.type === 'warning' && !alert.acknowledged);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Monitor className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Monitoring</h1>
            <div className="flex items-center space-x-2">
              {serviceMetrics.backend.status === 'healthy' ? (
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 text-xs rounded-full font-medium">
                  All Systems Operational
                </span>
              ) : (
                <span className="px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 text-xs rounded-full font-medium">
                  System Issues Detected
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>
            
            <button
              onClick={() => setIsAutoRefreshing(!isAutoRefreshing)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm ${
                isAutoRefreshing
                  ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isAutoRefreshing ? 'animate-spin' : ''}`} />
              <span>Auto Refresh</span>
            </button>
            
            <button
              onClick={onRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Refresh Now"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            
            <button
              onClick={onExportMetrics}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Export Metrics"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div className="flex items-center space-x-2 mb-1">
              <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Uptime</span>
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {formatUptime(serviceMetrics.backend.uptime)}
            </div>
          </div>
          
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <div className="flex items-center space-x-2 mb-1">
              <Terminal className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-800 dark:text-green-300">Active Sessions</span>
            </div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {serviceMetrics.sessions.active}
            </div>
          </div>
          
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <div className="flex items-center space-x-2 mb-1">
              <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="text-sm font-medium text-purple-800 dark:text-purple-300">Active Adapters</span>
            </div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {serviceMetrics.adapters.active}
            </div>
          </div>
          
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
            <div className="flex items-center space-x-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Active Alerts</span>
            </div>
            <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
              {criticalAlerts.length + warningAlerts.length}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Resources */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            System Resources
          </h2>
          
          <div className="space-y-4">
            {/* CPU */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">CPU Usage</span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {systemMetrics.cpu.usage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(systemMetrics.cpu.usage)}`}
                  style={{ width: `${systemMetrics.cpu.usage}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {systemMetrics.cpu.cores} cores
                {systemMetrics.cpu.temperature && ` • ${systemMetrics.cpu.temperature}°C`}
              </div>
            </div>

            {/* Memory */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">Memory Usage</span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {systemMetrics.memory.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(systemMetrics.memory.percentage)}`}
                  style={{ width: `${systemMetrics.memory.percentage}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatBytes(systemMetrics.memory.used)} / {formatBytes(systemMetrics.memory.total)}
              </div>
            </div>

            {/* Disk */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">Disk Usage</span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {systemMetrics.disk.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getUsageColor(systemMetrics.disk.percentage)}`}
                  style={{ width: `${systemMetrics.disk.percentage}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formatBytes(systemMetrics.disk.used)} / {formatBytes(systemMetrics.disk.total)}
              </div>
            </div>

            {/* Network */}
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Network className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Network Activity</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <Download className="w-3 h-3 text-green-500" />
                  <span className="text-gray-600 dark:text-gray-400">In:</span>
                  <span className="font-mono">{formatBytes(systemMetrics.network.bytesIn)}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Upload className="w-3 h-3 text-blue-500" />
                  <span className="text-gray-600 dark:text-gray-400">Out:</span>
                  <span className="font-mono">{formatBytes(systemMetrics.network.bytesOut)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Service Status */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Server className="w-5 h-5 mr-2" />
            Service Status
          </h2>
          
          <div className="space-y-4">
            {/* Backend Service */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-3">
                {getStatusIcon(serviceMetrics.backend.status)}
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Backend API</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {serviceMetrics.backend.requestsPerMinute} req/min • {serviceMetrics.backend.averageResponseTime}ms avg
                  </div>
                </div>
              </div>
              <div className={`text-sm font-medium ${getStatusColor(serviceMetrics.backend.status)}`}>
                {serviceMetrics.backend.status}
              </div>
            </div>

            {/* Adapters */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <Package className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Adapters</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {serviceMetrics.adapters.healthy}/{serviceMetrics.adapters.total} healthy
                    {serviceMetrics.adapters.errored > 0 && (
                      <span className="text-red-500 ml-1">• {serviceMetrics.adapters.errored} errors</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  {serviceMetrics.adapters.active} active
                </span>
              </div>
            </div>

            {/* WebSocket Connections */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <Network className="w-5 h-5 text-purple-500" />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">WebSocket Connections</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {serviceMetrics.websockets.messagesPerSecond} msg/sec
                  </div>
                </div>
              </div>
              <div className="text-sm font-medium text-purple-600 dark:text-purple-400">
                {serviceMetrics.websockets.connected} connected
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="text-gray-500 dark:text-gray-400 mb-1">Error Rate</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {serviceMetrics.backend.errorRate.toFixed(2)}%
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <div className="text-gray-500 dark:text-gray-400 mb-1">Avg Session</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {Math.round(serviceMetrics.sessions.averageDuration / 60)}m
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {filteredAlerts.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Active Alerts ({filteredAlerts.length})
            </h2>
            
            <div className="flex items-center space-x-2">
              {['error', 'warning', 'info'].map(type => (
                <button
                  key={type}
                  onClick={() => toggleAlertType(type)}
                  className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                    hiddenAlertTypes.has(type)
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      : type === 'error' ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      : type === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                      : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  }`}
                >
                  {hiddenAlertTypes.has(type) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span className="capitalize">{type}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start space-x-3 p-3 rounded-lg border ${
                  alert.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : alert.type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                }`}
              >
                {getAlertIcon(alert.type)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white">{alert.title}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{alert.message}</div>
                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{new Date(alert.timestamp).toLocaleString()}</span>
                    <span className="capitalize">{alert.source}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onAcknowledgeAlert(alert.id)}
                    className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700"
                  >
                    Acknowledge
                  </button>
                  <button
                    onClick={() => onDismissAlert(alert.id)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonitoringDashboard;