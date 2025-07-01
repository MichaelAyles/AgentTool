import { Fragment } from 'react';
import { Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon, 
  XCircleIcon 
} from '@heroicons/react/24/outline';
import { useNotifications, useUIActions } from '../store';

const iconMap = {
  success: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
  info: InformationCircleIcon,
};

const colorMap = {
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  error: 'bg-red-50 text-red-800 border-red-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
};

export function NotificationCenter() {
  const notifications = useNotifications();
  const { removeNotification } = useUIActions();

  return (
    <div className="fixed top-4 right-4 z-50 w-80 space-y-2">
      {notifications.map((notification) => {
        const Icon = iconMap[notification.type];
        const colorClass = colorMap[notification.type];
        
        return (
          <Transition
            key={notification.id}
            show={true}
            as={Fragment}
            enter="transform ease-out duration-300"
            enterFrom="translate-x-full"
            enterTo="translate-x-0"
            leave="transform ease-in duration-200"
            leaveFrom="translate-x-0"
            leaveTo="translate-x-full"
          >
            <div className={`rounded-lg border p-4 shadow-lg ${colorClass}`}>
              <div className="flex items-start">
                <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium">
                    {notification.message}
                  </p>
                  <p className="text-xs opacity-75 mt-1">
                    {notification.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="ml-4 inline-flex rounded-md p-1.5 hover:bg-black hover:bg-opacity-10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-current"
                  onClick={() => removeNotification(notification.id)}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Transition>
        );
      })}
    </div>
  );
}