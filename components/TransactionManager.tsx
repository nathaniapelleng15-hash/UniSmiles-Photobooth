import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { 
  Receipt, 
  Search, 
  Filter, 
  DollarSign, 
  CheckCircle, 
  CreditCard,
  RefreshCw,
  TrendingUp,
  XCircle,
  HelpCircle
} from 'lucide-react';

const API_BASE_URL = "https://unismile-backend.onrender.com";

export const TransactionManager: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Stats
  const [totalCount, setTotalCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLayout, setSelectedLayout] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const fetchTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch from backend
      const response = await fetch(`${API_BASE_URL}/api/transactions?limit=200`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.detail || data?.error || 'Failed to connect to backend server';
        if (message.includes('Access denied') || message.includes('ECONNREFUSED')) {
          throw new Error('Database MySQL belum terhubung. Isi DB_PASSWORD di server/.env lalu restart backend.');
        }
        throw new Error(message);
      }
      const data = await response.json();
      if (data.success) {
        setTransactions(data.transactions || []);
        setTotalCount(data.total || 0);
        setSuccessCount(data.success_count || 0);
        setTotalRevenue(data.success_amount || 0);
      } else {
        throw new Error(data.error || 'Unknown error occurred');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal menghubungi server backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(val);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getLayoutLabel = (layoutId: string) => {
    const labels: Record<string, string> = {
      '1x1': 'Polaroid (1x1)',
      '2x1': 'Strip (2x1)',
      '3x1': 'Strip (3x1)',
      '4x1': 'Strip (4x1)',
      '2x2': 'Grid (2x2)',
      '2x3': 'Grid (2x3)',
      '3x3': 'Grid (3x3)',
    };
    return labels[layoutId] || layoutId;
  };

  // Filter local logic for quick responsive UI feel
  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      t.transaction_code.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.session_id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLayout = selectedLayout === '' || t.layout_id === selectedLayout;
    const matchesStatus = selectedStatus === '' || t.status === selectedStatus;

    return matchesSearch && matchesLayout && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Receipt className="text-indigo-600 animate-pulse" />
            Transaction History
          </h2>
          <p className="text-sm text-gray-500">Monitor and search customer payment logs in real-time.</p>
        </div>
        <button
          id="btn-refresh"
          onClick={fetchTransactions}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh Data
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div id="kartu-kpi" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Total Revenue */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md hover:scale-[1.01]">
          <div className="space-y-1">
            <span className="text-sm font-medium text-gray-400">Total Pendapatan</span>
            <h3 className="text-2xl font-black text-gray-800">{formatCurrency(totalRevenue)}</h3>
            <div className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1">
              <TrendingUp size={14} />
              <span>Penerimaan Sukses</span>
            </div>
          </div>
          <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600">
            <DollarSign size={28} />
          </div>
        </div>

        {/* Card 2: Transaction Success Count */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md hover:scale-[1.01]">
          <div className="space-y-1">
            <span className="text-sm font-medium text-gray-400">Transaksi Sukses</span>
            <h3 className="text-2xl font-black text-gray-800">{successCount} / {totalCount}</h3>
            <div className="flex items-center gap-1 text-xs text-indigo-600 font-semibold mt-1">
              <span>Rasio Konversi: {totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0}%</span>
            </div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600">
            <CheckCircle size={28} />
          </div>
        </div>

        {/* Card 3: Payment Method */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition-all hover:shadow-md hover:scale-[1.01]">
          <div className="space-y-1">
            <span className="text-sm font-medium text-gray-400">Metode Utama</span>
            <h3 className="text-2xl font-black text-gray-800">QRIS</h3>
            <div className="flex items-center gap-1 text-xs text-amber-600 font-semibold mt-1">
              <span>Pembayaran QR Otomatis</span>
            </div>
          </div>
          <div className="p-4 bg-amber-50 rounded-2xl text-amber-600">
            <CreditCard size={28} />
          </div>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
            <Search size={18} />
          </span>
          <input
            id="input-search"
            type="text"
            placeholder="Cari Kode Transaksi / ID Sesi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-700"
          />
        </div>

        {/* Filters Select */}
        <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
          {/* Filter Layout */}
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <select
              value={selectedLayout}
              onChange={(e) => setSelectedLayout(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer"
            >
              <option value="">Semua Layout</option>
              <option value="1x1">Polaroid (1x1)</option>
              <option value="2x1">Strip (2x1)</option>
              <option value="3x1">Strip (3x1)</option>
              <option value="4x1">Strip (4x1)</option>
              <option value="2x2">Grid (2x2)</option>
              <option value="2x3">Grid (2x3)</option>
              <option value="3x3">Grid (3x3)</option>
            </select>
          </div>

          {/* Filter Status */}
          <select
            id="dropdown-status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="">Semua Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
            <RefreshCw className="animate-spin text-indigo-500" size={32} />
            <p className="text-sm font-medium">Memuat data transaksi...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-500 space-y-3">
            <XCircle className="mx-auto" size={48} />
            <p className="font-bold">{error}</p>
            <button 
              onClick={fetchTransactions}
              className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-2">
            <Receipt size={48} className="opacity-40" />
            <p className="font-bold text-gray-600">Tidak Ada Transaksi</p>
            <p className="text-xs text-gray-400">Silakan sesuaikan filter atau cari kata kunci lain.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table id="tabel-transaksi" className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <th className="py-4 px-6">Kode Transaksi</th>
                  <th className="py-4 px-6">Waktu Transaksi</th>
                  <th className="py-4 px-6">ID Sesi</th>
                  <th className="py-4 px-6">Layout</th>
                  <th className="py-4 px-6">Nominal</th>
                  <th className="py-4 px-6">Metode</th>
                  <th className="py-4 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-600">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 font-mono font-semibold text-gray-800">{t.transaction_code}</td>
                    <td className="py-4 px-6 whitespace-nowrap">{formatDate(t.created_at)}</td>
                    <td className="py-4 px-6 font-mono text-xs text-gray-400" title={t.session_id}>
                      {t.session_id.length > 12 ? `${t.session_id.substring(0, 12)}...` : t.session_id}
                    </td>
                    <td className="py-4 px-6">
                      <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-100">
                        {getLayoutLabel(t.layout_id)}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-bold text-gray-800">{formatCurrency(t.amount)}</td>
                    <td className="py-4 px-6">
                      <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2 py-0.5 rounded border border-amber-100 uppercase tracking-wide">
                        {t.payment_method}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                        t.status === 'success' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                          : t.status === 'pending'
                          ? 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse'
                          : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          t.status === 'success' ? 'bg-emerald-600' : t.status === 'pending' ? 'bg-amber-500' : 'bg-rose-600'
                        }`} />
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
