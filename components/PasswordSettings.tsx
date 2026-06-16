import React, { useState } from 'react';
import { getAppConfig, saveAppConfig } from '../services/storageService';
import { Lock, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

export const PasswordSettings: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const config = getAppConfig();

    if (currentPassword !== config.password) {
      setStatus('error');
      setMessage('Current password is incorrect.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('New passwords do not match.');
      return;
    }

    if (newPassword.length < 4) {
      setStatus('error');
      setMessage('Password must be at least 4 characters.');
      return;
    }

    saveAppConfig({ ...config, password: newPassword });
    setStatus('success');
    setMessage('Password updated successfully!');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    
    // Reset success message after 3 seconds
    setTimeout(() => {
        setStatus('idle');
        setMessage('');
    }, 3000);
  };

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Lock className="text-gray-500" size={24} />
          Security Settings
        </h2>
        <p className="text-sm text-gray-500 mt-1">Update the password used to access this control panel.</p>
      </div>

      <form onSubmit={handleUpdate} className="space-y-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
          <input
            id="input-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
            placeholder="Enter current password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input
            id="input-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
            placeholder="Enter new password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
          <input
            id="input-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
            placeholder="Confirm new password"
          />
        </div>

        {/* Persistent Notifications for Katalon */}
        <div 
          id="notif-success" 
          className="success items-center gap-2 p-3 rounded-lg text-sm bg-green-50 text-green-700"
          style={{ display: status === 'success' ? 'flex' : 'none' }}
        >
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>

        <div 
          id="notif-error" 
          className="error items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700"
          style={{ display: status === 'error' ? 'flex' : 'none' }}
        >
          <AlertCircle size={18} />
          <span>{message}</span>
        </div>

        <div className="pt-2">
          <button
            id="btn-update-password"
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white py-2.5 rounded-lg font-medium transition-colors"
          >
            <Save size={18} />
            Update Password
          </button>
        </div>
      </form>
    </div>
  );
};