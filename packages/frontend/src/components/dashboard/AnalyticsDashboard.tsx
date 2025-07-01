import React, { useState } from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  TrendingUp,
  TrendingDown,
  Users,
  Terminal,
  Package,
  Clock,
  Calendar,
  Download,
  Play,
  Activity,
  Zap,
  Filter,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

export interface AnalyticsData {
  usage: {
    totalSessions: number;
    totalCommands: number;
    totalUptime: number;
    uniqueUsers: number;
    trendsData: {
      period: string;
      sessions: number;
      commands: number;
      users: number;
    }[];
  };
  adapters: {
    mostUsed: Array<{
      name: string;
      usage: number;
      trend: 'up' | 'down' | 'stable';
      percentage: number;
    }>;
    performance: Array<{
      name: string;
      responseTime: number;
      successRate: number;
      errorCount: number;
    }>;
  };
  users: {
    activeUsers: number;
    newUsers: number;
    retention: number;
    topUsers: Array<{
      name: string;
      sessions: number;
      commands: number;
      lastActive: string;
    }>;
  };
  system: {
    uptime: number;
    peakConcurrency: number;
    averageSessionDuration: number;
    totalDataProcessed: number;
  };
}

export interface AnalyticsDashboardProps {
  data: AnalyticsData;
  timeRange: '1h' | '24h' | '7d' | '30d' | '90d';
  onTimeRangeChange: (range: '1h' | '24h' | '7d' | '30d' | '90d') => void;
  onRefresh: () => void;
  onExport: () => void;
  loading?: boolean;
}

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  data,
  timeRange,
  onTimeRangeChange,
  onRefresh,
  onExport,
  loading = false,
}) => {
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set(['sessions', 'commands', 'users']));
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  const toggleMetric = (metric: string) => {
    const newSelected = new Set(selectedMetrics);
    if (newSelected.has(metric)) {
      newSelected.delete(metric);
    } else {
      newSelected.add(metric);
    }
    setSelectedMetrics(newSelected);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
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

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <ArrowUpRight className="w-4 h-4 text-green-500" />;
      case 'down':
        return <ArrowDownRight className="w-4 h-4 text-red-500" />;
      case 'stable':
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'text-green-600 dark:text-green-400';
      case 'down':
        return 'text-red-600 dark:text-red-400';
      case 'stable':
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const timeRangeOptions = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
          </div>
          
          <div className="flex items-center space-x-3">
            <select
              value={timeRange}
              onChange={(e) => onTimeRangeChange(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {timeRangeOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            
            <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setChartType('line')}
                className={`px-3 py-2 text-sm ${
                  chartType === 'line'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                <LineChart className="w-4 h-4" />
              </button>
              <button
                onClick={() => setChartType('bar')}
                className={`px-3 py-2 text-sm border-l border-gray-300 dark:border-gray-600 ${
                  chartType === 'bar'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
            </div>
            
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            <button
              onClick={onExport}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              title="Export Data"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Metric Selection */}
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Show:</span>
          {[
            { key: 'sessions', label: 'Sessions', color: 'blue' },
            { key: 'commands', label: 'Commands', color: 'green' },
            { key: 'users', label: 'Users', color: 'purple' },
          ].map(metric => (
            <button
              key={metric.key}
              onClick={() => toggleMetric(metric.key)}
              className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-sm ${
                selectedMetrics.has(metric.key)
                  ? `bg-${metric.color}-100 dark:bg-${metric.color}-900/20 text-${metric.color}-700 dark:text-${metric.color}-400`
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {selectedMetrics.has(metric.key) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>{metric.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Terminal className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Sessions</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.usage.totalSessions)}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Across all adapters and users
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Commands Executed</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.usage.totalCommands)}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total commands processed
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Users</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(data.users.activeUsers)}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {data.users.newUsers} new this period
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
              <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Session</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatDuration(data.system.averageSessionDuration)}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Average session duration
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usage Trends Chart */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2" />
            Usage Trends
          </h2>
          
          <div className="h-64 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <LineChart className="w-12 h-12 mx-auto mb-2" />
              <div className="text-sm">
                {chartType === 'line' ? 'Line Chart' : 'Bar Chart'} would be rendered here
              </div>
              <div className="text-xs mt-1">
                Showing {Array.from(selectedMetrics).join(', ')} over {timeRange}
              </div>
            </div>
          </div>
        </div>

        {/* Adapter Usage */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Package className="w-5 h-5 mr-2" />
            Most Used Adapters
          </h2>
          
          <div className="space-y-3">
            {data.adapters.mostUsed.map((adapter, index) => (
              <div key={adapter.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-400">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{adapter.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {formatNumber(adapter.usage)} uses
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {adapter.percentage.toFixed(1)}%
                  </div>
                  <div className={`flex items-center space-x-1 ${getTrendColor(adapter.trend)}`}>
                    {getTrendIcon(adapter.trend)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Adapter Performance */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Adapter Performance
          </h2>
          
          <div className="space-y-3">
            {data.adapters.performance.map((adapter) => (
              <div key={adapter.name} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-gray-900 dark:text-white">{adapter.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {adapter.responseTime}ms avg
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-1">Success Rate</div>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${adapter.successRate}%` }}
                        />
                      </div>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {adapter.successRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-gray-500 dark:text-gray-400 mb-1">Errors</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {adapter.errorCount}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Users */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2" />
            Top Active Users
          </h2>
          
          <div className="space-y-3">
            {data.users.topUsers.map((user, index) => (
              <div key={user.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center text-sm font-medium text-purple-600 dark:text-purple-400">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{user.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {user.sessions} sessions • {formatNumber(user.commands)} commands
                    </div>
                  </div>
                </div>
                
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(user.lastActive).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* System Stats */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2" />
          System Statistics
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {formatDuration(data.system.uptime)}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">System Uptime</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {data.system.peakConcurrency}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Peak Concurrency</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {formatBytes(data.system.totalDataProcessed)}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Data Processed</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {data.users.retention.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">User Retention</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;